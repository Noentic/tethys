import type { DiffSource, WorktreeInfo } from "@tethys/bindings";
import { Badge, Button, Popover, useInspectorControl } from "@tethys/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReviewClient } from "./client-context";
import { CommitBox } from "./commit-box";
import { summarizeDiff, useDiffSummary } from "./use-review-diff";

export interface BranchBarProps {
  sessionId: string;
  branchName?: string;
  worktree?: boolean;
  noGit?: boolean;
  turnRunning?: boolean;
  className?: string;
}

/** Git context and the only entry point for committing a thread's changes. */
export function BranchBar({
  sessionId,
  branchName,
  worktree = false,
  noGit = false,
  turnRunning = false,
  className,
}: BranchBarProps) {
  const client = useReviewClient();
  const { open, openChanges } = useInspectorControl();
  const commitButtonRef = useRef<HTMLButtonElement>(null);
  const [base, setBase] = useState("HEAD");
  const [commitOpen, setCommitOpen] = useState(false);
  const [committed, setCommitted] = useState<{
    oid: string;
    aheadOfBase: number;
  } | null>(null);

  useEffect(() => {
    if (!worktree || !client.git.worktreeList) return;
    let active = true;
    void client.git
      .worktreeList()
      .then((worktrees: WorktreeInfo[]) => {
        if (active) {
          setBase(
            worktrees.find((item) => item.thread_id === sessionId)?.base ??
              "HEAD",
          );
        }
      })
      .catch(() => {
        if (active) setBase("HEAD");
      });
    return () => {
      active = false;
    };
  }, [client, sessionId, worktree]);

  const source = useMemo<DiffSource>(
    () =>
      worktree
        ? { BaseWorktree: { thread_id: sessionId, base } }
        : { HeadWorktree: { thread_id: sessionId } },
    [base, sessionId, worktree],
  );
  const { summary } = useDiffSummary(noGit ? null : source);
  const draft = useCallback(async () => {
    if (!client.commands || !summary) return "";
    return (await client.commands.expand("commit", summarizeDiff(summary)))
      .text;
  }, [client, summary]);
  const commit = useCallback(
    async (message: string) => {
      const result = await client.git.commit(sessionId, message);
      setCommitted({
        oid: result.oid.slice(0, 7),
        aheadOfBase: result.ahead_of_base,
      });
      setCommitOpen(false);
    },
    [client, sessionId],
  );

  if (noGit) {
    return (
      <div
        role="toolbar"
        aria-label="Branch actions"
        data-testid="branch-bar"
        className={className}
      >
        <Badge variant="muted">no git · no revert</Badge>
      </div>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label="Branch actions"
      data-testid="branch-bar"
      className={`flex min-w-0 flex-wrap items-center gap-sm ${className ?? ""}`}
    >
      <span className="truncate text-label-sm text-(--tethys-text-secondary)">
        ⑂ {branchName || "branch"} ·{" "}
        {worktree ? "worktree" : "current checkout"}
      </span>
      <span className="font-mono text-mono-micro text-(--tethys-text-muted)">
        vs {worktree ? base : "HEAD"}
      </span>
      {summary && (
        <span className="inline-flex items-center gap-1 font-mono text-mono-micro">
          <span className="text-diff-added">+{summary.additions}</span>
          <span className="text-diff-removed">−{summary.deletions}</span>
        </span>
      )}
      <span className="ml-auto flex items-center gap-xs">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => (openChanges ?? open)()}
        >
          Review
        </Button>
        {committed ? (
          <>
            <span className="font-mono text-mono-micro text-(--tethys-status-success)">
              ✓ {committed.oid} · {committed.aheadOfBase} ahead of {base}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled
              title="Merge is not available yet"
            >
              Merge…
            </Button>
          </>
        ) : (
          <div className="relative">
            <Button
              ref={commitButtonRef}
              size="sm"
              variant="secondary"
              disabled={turnRunning || !summary || summary.files.length === 0}
              aria-haspopup="dialog"
              aria-expanded={commitOpen}
              onClick={() => setCommitOpen(true)}
            >
              Commit…
            </Button>
            <Popover
              open={commitOpen}
              onClose={() => setCommitOpen(false)}
              anchorRef={commitButtonRef}
              className="bottom-full right-0 mb-2 w-80"
            >
              {summary && (
                <div className="p-sm">
                  <CommitBox
                    fileCount={summary.files.length}
                    draftOnMount
                    onDraft={draft}
                    onCommit={commit}
                  />
                </div>
              )}
            </Popover>
          </div>
        )}
      </span>
    </div>
  );
}
