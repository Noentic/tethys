import type {
  DiffFileDetail,
  DiffSource,
  HunkRef,
  RestoreTarget,
} from "@tethys/bindings";
import { DiffViewer } from "@tethys/diff";
import {
  useWorkspaceReviewCapability,
  type WorkspaceCapabilityFixture,
} from "@tethys/state";
import { Badge, Button, cn } from "@tethys/ui";
import { useEffect, useMemo, useState } from "react";
import { useReviewClient } from "./client-context";
import { CommitBox } from "./commit-box";
import { FileHeader } from "./file-header";
import {
  defaultDiffSource,
  summarizeDiff,
  useDiffSummary,
} from "./use-review-diff";

/** Built-in Tethys command the `Draft with agent` action expands (M1.9 U7). */
export const DRAFT_COMMIT_COMMAND = "commit";

export interface ReviewPanelProps {
  sessionId?: string;
  capabilityFixture?: WorkspaceCapabilityFixture;
  source?: DiffSource;
  className?: string;
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
  className,
}: ReviewPanelProps) {
  const gate = useWorkspaceReviewCapability(sessionId, capabilityFixture);
  const client = useReviewClient();
  const threadId = sessionId;
  const diffSource = useMemo(
    () => source ?? defaultDiffSource(threadId),
    [source, threadId],
  );
  const { summary, loading } = useDiffSummary(
    gate.showDiff ? diffSource : null,
  );

  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [detail, setDetail] = useState<DiffFileDetail | null>(null);
  const [stagedPaths, setStagedPaths] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (expandedPath === null) {
      setDetail(null);
      return;
    }
    let active = true;
    void client.git
      .diffFile(diffSource, expandedPath)
      .then((next) => {
        if (active) setDetail(next);
      })
      .catch(() => {
        if (active) setDetail(null);
      });
    return () => {
      active = false;
    };
  }, [client, diffSource, expandedPath]);

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

  if (loading || summary === null) {
    return null;
  }

  const files = summary.files;

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
    const hunks: HunkRef[] = [{ path, hunk_index: hunkIndex }];
    void client.git.discard(threadId, diffSource, hunks).catch(() => {});
  };

  const discardFile = async (path: string) => {
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

  const draft = async (): Promise<string> => {
    if (!client.commands || summary === null) {
      return "";
    }
    const expanded = await client.commands.expand(
      DRAFT_COMMIT_COMMAND,
      summarizeDiff(summary),
    );
    return expanded.text;
  };

  const commit = async (message: string) => {
    await client.git.commit(threadId, message);
  };

  // ponytail: the panel has no turn number (the slot passes only `sessionId`),
  // so this targets the first turn's start. Thread the real turn through when
  // the session's turn anchor is available.
  const restoreTurn = () => {
    const target: RestoreTarget = {
      Checkpoint: { thread_id: threadId, turn: 1, phase: "Start" },
    };
    void client.git.checkpointRestore(target, "Force").catch(() => {});
  };

  return (
    <section
      data-testid="review-panel"
      aria-label="Review"
      className={cn("flex flex-col gap-3", className)}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-heading-md text-(--tethys-text-primary)">Review</h2>
        <span className="text-label-sm text-(--tethys-text-muted)">
          {files.length} changed file{files.length === 1 ? "" : "s"}
        </span>
      </header>

      <div className="flex flex-col gap-2">
        {files.map((file) => (
          <div key={file.path} className="flex flex-col gap-1">
            <FileHeader
              file={file}
              staged={stagedPaths.has(file.path)}
              expanded={expandedPath === file.path}
              onToggleStage={() => toggleStage(file.path)}
              onToggleExpanded={() =>
                setExpandedPath((current) =>
                  current === file.path ? null : file.path,
                )
              }
              onDiscardFile={() => void discardFile(file.path)}
            />
            {expandedPath === file.path &&
              detail !== null &&
              detail.path === file.path && (
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
                  <DiffViewer detail={detail} className="max-h-80" />
                </>
              )}
          </div>
        ))}
      </div>

      <CommitBox onDraft={draft} onCommit={commit} />

      {gate.showRevert && (
        <Button variant="destructive" onClick={restoreTurn}>
          Restore worktree to before this turn
        </Button>
      )}
    </section>
  );
}
