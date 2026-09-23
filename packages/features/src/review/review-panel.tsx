import type {
  DiffFile,
  DiffFileDetail,
  DiffSource,
  HunkRef,
} from "@tethys/bindings";
import { COMPOSER_INSERT_CHIP_EVENT, type EditorChip } from "@tethys/composer";
import { DiffViewer } from "@tethys/diff";
import {
  useWorkspaceReviewCapability,
  type WorkspaceCapabilityFixture,
} from "@tethys/state";
import { Badge, Button, cn, Popover } from "@tethys/ui";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSessionState } from "../inspector/use-session-state";
import { useReviewClient } from "./client-context";
import { FileHeader } from "./file-header";
import { defaultDiffSource, useDiffSummary } from "./use-review-diff";

export interface ReviewPanelProps {
  sessionId?: string;
  capabilityFixture?: WorkspaceCapabilityFixture;
  source?: DiffSource;
  data?: unknown;
  className?: string;
}

interface LineComment {
  id: number;
  path: string;
  line: number;
  text: string;
}

function scopeFor(
  source?: DiffSource,
): "turn" | "thread" | "uncommitted" | null {
  if (!source) return null;
  if ("TurnStartEnd" in source || "TurnStartWorktree" in source) return "turn";
  if ("BaseLatestEnd" in source) return "thread";
  return "uncommitted";
}

/**
 * The review inspector surface (M1.9 U7). Gated on `workspace.capabilities`
 * through the U6 hook; when git is absent it renders the stated reason and
 * nothing else. Stage is path-level, discard is hunk-level, and no forge action
 * exists anywhere (push/PR is M2.6).
 */
export function ReviewPanel({
  sessionId = "",
  capabilityFixture,
  source,
  data,
  className,
}: ReviewPanelProps) {
  const gate = useWorkspaceReviewCapability(sessionId, capabilityFixture);
  const session = useSessionState(sessionId);
  const client = useReviewClient();
  const threadId = sessionId;
  const requestedSource =
    data && typeof data === "object" && "source" in data
      ? (data as { source?: DiffSource }).source
      : undefined;
  const anchorSource = source ?? requestedSource;
  const requestedTurn =
    anchorSource?.TurnStartEnd?.turn ?? anchorSource?.TurnStartWorktree?.turn;
  const [scope, setScope] = useState<"turn" | "thread" | "uncommitted">(
    () => scopeFor(anchorSource) ?? "turn",
  );
  const [baseInfo, setBaseInfo] = useState({ threadId: "", base: "HEAD" });
  const base = baseInfo.threadId === threadId ? baseInfo.base : "HEAD";
  const turn = requestedTurn ?? session.turnCount;
  const inProgress =
    session.status === "running" || session.status === "awaiting_approval";
  const diffSource = useMemo<DiffSource | null>(() => {
    if (scope === "uncommitted") return defaultDiffSource(threadId);
    if (scope === "thread") {
      return { BaseLatestEnd: { thread_id: threadId, base } };
    }
    if (turn < 1) return null;
    return inProgress
      ? { TurnStartWorktree: { thread_id: threadId, turn } }
      : { TurnStartEnd: { thread_id: threadId, turn } };
  }, [base, inProgress, scope, threadId, turn]);
  const { summary, loading } = useDiffSummary(
    gate.showDiff ? diffSource : null,
  );
  const scopeButtonRef = useRef<HTMLButtonElement>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [detail, setDetail] = useState<DiffFileDetail | null>(null);
  const [stagedPaths, setStagedPaths] = useState<Set<string>>(() => new Set());
  const [lineComment, setLineComment] = useState<{
    path: string;
    line: number;
  } | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [comments, setComments] = useState<LineComment[]>([]);
  const nextCommentId = useRef(1);
  const panelRef = useRef<HTMLElement>(null);
  const [panelWidth, setPanelWidth] = useState(640);
  const files = summary?.files ?? [];
  const selectedPath =
    expandedPath && files.some((file) => file.path === expandedPath)
      ? expandedPath
      : (files[0]?.path ?? null);
  const fileGroups = useMemo(() => {
    const groups = new Map<string, DiffFile[]>();
    for (const file of files) {
      const separator = file.path.lastIndexOf("/");
      const directory = separator < 0 ? "" : file.path.slice(0, separator);
      const group = groups.get(directory) ?? [];
      group.push(file);
      groups.set(directory, group);
    }
    return [...groups.entries()];
  }, [files]);

  useEffect(() => {
    const element = panelRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPanelWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!gate.showDiff || !client.git.worktreeList) return;
    let active = true;
    void client.git
      .worktreeList()
      .then((worktrees) => {
        if (active) {
          setBaseInfo({
            threadId,
            base:
              worktrees.find((worktree) => worktree.thread_id === threadId)
                ?.base ?? "HEAD",
          });
        }
      })
      .catch(() => {
        if (active) setBaseInfo({ threadId, base: "HEAD" });
      });
    return () => {
      active = false;
    };
  }, [client, gate.showDiff, threadId]);

  useEffect(() => {
    if (requestedTurn !== undefined) {
      setScope("turn");
      setExpandedPath(null);
      setStagedPaths(new Set());
      setLineComment(null);
      setComments([]);
    }
  }, [requestedTurn]);

  useEffect(() => {
    setDetail(null);
    if (selectedPath === null || diffSource === null) {
      return;
    }
    let active = true;
    void client.git
      .diffFile(diffSource, selectedPath)
      .then((next) => {
        if (active) setDetail(next);
      })
      .catch(() => {
        if (active) setDetail(null);
      });
    return () => {
      active = false;
    };
  }, [client, diffSource, selectedPath]);

  if (!gate.showDiff) {
    return (
      <section
        data-testid="review-hidden"
        className={cn("flex items-center gap-2 p-md", className)}
      >
        <Badge variant="muted">{gate.hiddenReason}</Badge>
      </section>
    );
  }

  if (loading) {
    return null;
  }

  const showFileTree = panelWidth >= 640;
  const scopeLabel =
    scope === "turn"
      ? "This turn"
      : scope === "thread"
        ? `Thread vs ${base}`
        : "Uncommitted";

  const toggleStage = (path: string) => {
    const next = new Set(stagedPaths);
    const wasStaged = next.has(path);
    if (wasStaged) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setStagedPaths(next);
    void (
      wasStaged
        ? client.git.unstage(threadId, [path])
        : client.git.stage(threadId, [path])
    ).catch(() => {
      // The optimistic toggle stays; a failed write reconciles on reload.
    });
  };

  const discardHunk = (path: string, hunkIndex: number) => {
    if (diffSource === null) return;
    const hunks: HunkRef[] = [{ path, hunk_index: hunkIndex }];
    void client.git.discard(threadId, diffSource, hunks).catch(() => {});
  };

  const discardFile = async (path: string) => {
    if (diffSource === null) return;
    try {
      const fileDetail =
        detail?.path === path
          ? detail
          : await client.git.diffFile(diffSource, path);
      const hunks: HunkRef[] = fileDetail.hunks.map((_hunk, index) => ({
        path,
        hunk_index: index,
      }));
      await client.git.discard(threadId, diffSource, hunks);
    } catch {
      // Leave the list as-is; the engine's error surfaces on the next fetch.
    }
  };

  const addLineComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!lineComment || commentDraft.trim() === "") return;
    setComments((current) => [
      ...current,
      {
        id: nextCommentId.current++,
        ...lineComment,
        text: commentDraft.trim(),
      },
    ]);
    setLineComment(null);
    setCommentDraft("");
  };

  const sendComments = () => {
    if (comments.length === 0) return;
    const countLabel = `${comments.length} comment${
      comments.length === 1 ? "" : "s"
    }`;
    const chip: EditorChip = {
      kind: "review",
      name: countLabel,
      token: `Review comments:\n${comments
        .map((comment) => `- ${comment.path}:${comment.line} — ${comment.text}`)
        .join("\n")}`,
    };
    window.dispatchEvent(
      new CustomEvent(COMPOSER_INSERT_CHIP_EVENT, { detail: chip }),
    );
    setComments([]);
  };

  const selectFile = (path: string) => {
    setExpandedPath(path);
    setLineComment(null);
  };

  return (
    <section
      ref={panelRef}
      data-testid="review-panel"
      aria-label="Review"
      className={cn("flex min-h-0 flex-col gap-3", className)}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-heading-md text-(--tethys-text-primary)">Review</h2>
        <span className="text-label-sm text-(--tethys-text-muted)">
          {files.length} changed file{files.length === 1 ? "" : "s"}
        </span>
      </header>

      <div
        role="toolbar"
        aria-label="Change review options"
        className="flex h-9 shrink-0 items-center gap-sm border-b border-(--tethys-hairline)"
      >
        <div className="relative">
          <Button
            ref={scopeButtonRef}
            size="sm"
            variant="ghost"
            role="combobox"
            aria-label={`Diff scope: ${scopeLabel}`}
            aria-haspopup="listbox"
            aria-expanded={scopeOpen}
            onClick={() => setScopeOpen((open) => !open)}
          >
            {scopeLabel} <span aria-hidden="true">▾</span>
          </Button>
          <Popover
            open={scopeOpen}
            onClose={() => setScopeOpen(false)}
            anchorRef={scopeButtonRef}
            className="top-full left-0 mt-1 w-56"
          >
            <div role="listbox" aria-label="Diff scope" className="p-1">
              {(
                [
                  ["turn", "This turn"],
                  ["thread", `Thread vs ${base}`],
                  ["uncommitted", "Uncommitted"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="option"
                  aria-selected={scope === value}
                  onClick={() => {
                    setScope(value);
                    setScopeOpen(false);
                    setExpandedPath(null);
                    setStagedPaths(new Set());
                    setLineComment(null);
                    setComments([]);
                  }}
                  className="focus-ring flex w-full items-center rounded-sm px-2 py-1.5 text-left text-label-md text-(--tethys-text-primary) hover:bg-(--tethys-surface-hover)"
                >
                  {label}
                </button>
              ))}
            </div>
          </Popover>
        </div>
        {!showFileTree && files.length > 0 && (
          <select
            aria-label="Changed file"
            value={selectedPath ?? ""}
            onChange={(event) => selectFile(event.target.value)}
            className="h-7 min-w-0 flex-1 rounded-sm border border-(--tethys-hairline) bg-(--tethys-surface-panel) px-2 text-label-sm text-(--tethys-text-primary)"
          >
            {files.map((file) => (
              <option key={file.path} value={file.path}>
                {file.path}
              </option>
            ))}
          </select>
        )}
      </div>

      {files.length === 0 ? (
        <p className="py-md text-body-sm text-(--tethys-text-muted)">
          No changes{" "}
          {scope === "turn"
            ? "in this turn"
            : scope === "thread"
              ? "in this thread"
              : "in the worktree"}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 gap-sm overflow-hidden">
          {showFileTree && (
            <aside
              aria-label="Changed files"
              className="w-40 shrink-0 overflow-y-auto border-r border-(--tethys-hairline) pr-sm"
            >
              {fileGroups.map(([directory, group]) => (
                <details key={directory || "root"} open className="mb-1">
                  {directory && (
                    <summary className="cursor-pointer truncate py-1 text-label-sm text-(--tethys-text-muted)">
                      {directory}
                    </summary>
                  )}
                  <ul>
                    {group.map((file) => (
                      <li key={file.path}>
                        <button
                          type="button"
                          aria-pressed={selectedPath === file.path}
                          onClick={() => selectFile(file.path)}
                          className="focus-ring flex w-full min-w-0 flex-col rounded-sm px-1.5 py-1 text-left hover:bg-(--tethys-surface-hover)"
                        >
                          <span className="truncate font-mono text-mono-micro text-(--tethys-text-secondary)">
                            {file.path.slice(file.path.lastIndexOf("/") + 1)}
                          </span>
                          <span className="font-mono text-mono-micro">
                            <span className="text-diff-added">
                              +{file.additions}
                            </span>{" "}
                            <span className="text-diff-removed">
                              −{file.deletions}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </aside>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-y-auto">
            {files
              .filter((file) => file.path === selectedPath)
              .map((file) => (
                <div key={file.path} className="flex flex-col gap-1">
                  <FileHeader
                    file={file}
                    staged={stagedPaths.has(file.path)}
                    expanded
                    onToggleStage={() => toggleStage(file.path)}
                    onToggleExpanded={() => selectFile(file.path)}
                    onDiscardFile={() => void discardFile(file.path)}
                  />
                  {detail !== null && detail.path === file.path && (
                    <>
                      <div
                        data-testid="hunk-actions"
                        className="flex flex-wrap gap-1"
                      >
                        {detail.hunks.map((hunk, index) => (
                          <Button
                            key={`${file.path}:${hunk.old_start}:${hunk.new_start}`}
                            size="sm"
                            variant="destructive"
                            onClick={() => discardHunk(file.path, index)}
                          >
                            Discard hunk {index + 1}
                          </Button>
                        ))}
                      </div>
                      <DiffViewer
                        detail={detail}
                        className="max-h-80"
                        onCommentLine={(line) => {
                          setLineComment({ path: file.path, line });
                          setCommentDraft("");
                        }}
                      />
                      {lineComment?.path === file.path && (
                        <form
                          onSubmit={addLineComment}
                          className="flex flex-col gap-xs rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-panel) p-sm"
                        >
                          <label
                            htmlFor="review-line-comment"
                            className="text-label-sm text-(--tethys-text-secondary)"
                          >
                            Comment on {lineComment.path}:{lineComment.line}
                          </label>
                          <textarea
                            id="review-line-comment"
                            rows={2}
                            value={commentDraft}
                            onChange={(event) =>
                              setCommentDraft(event.target.value)
                            }
                            className="min-h-12 resize-y rounded-sm border border-(--tethys-hairline) bg-(--tethys-surface-sunken) p-sm text-body-sm text-(--tethys-text-primary)"
                          />
                          <div className="flex justify-end gap-xs">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setLineComment(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="submit"
                              size="sm"
                              disabled={commentDraft.trim() === ""}
                            >
                              Add comment
                            </Button>
                          </div>
                        </form>
                      )}
                    </>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
      {comments.length > 0 && (
        <footer
          data-testid="review-comments"
          className="sticky bottom-0 flex shrink-0 flex-col gap-sm border-t border-(--tethys-hairline) bg-(--tethys-surface-panel) pt-sm"
        >
          <ul className="flex flex-col gap-1">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="flex min-w-0 items-start gap-sm text-label-sm text-(--tethys-text-secondary)"
              >
                <span className="min-w-0 flex-1 truncate">
                  {comment.path}:{comment.line} — {comment.text}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove comment on ${comment.path}:${comment.line}`}
                  onClick={() =>
                    setComments((current) =>
                      current.filter((item) => item.id !== comment.id),
                    )
                  }
                >
                  ×
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex h-9 items-center justify-between">
            <span className="text-label-sm text-(--tethys-text-muted)">
              {comments.length} comment{comments.length === 1 ? "" : "s"}
            </span>
            <Button size="sm" onClick={sendComments}>
              Send to agent
            </Button>
          </div>
        </footer>
      )}
    </section>
  );
}
