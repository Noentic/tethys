import { FileText, GitBranch, GitCommit } from "@nebutra/icons";
import type { DiffSource, WorktreeInfo } from "@tethys/bindings";
import { Badge, Button, Popover, useInspectorControl } from "@tethys/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReviewClient } from "./client-context";
import { CommitBox } from "./commit-box";
import {
  summarizeDiff,
  useDiffRevision,
  useDiffSummary,
} from "./use-review-diff";

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
  const [checkoutBranch, setCheckoutBranch] = useState<string | null>(null);
  const revision = useDiffRevision(sessionId);
  const [commitOpen, setCommitOpen] = useState(false);
  const [committed, setCommitted] = useState<{
    oid: string;
    aheadOfBase: number;
  } | null>(null);

  const source = useMemo<DiffSource>(
    () =>
      worktree
        ? { BaseWorktree: { thread_id: sessionId, base } }
        : { HeadWorktree: { thread_id: sessionId } },
    [base, sessionId, worktree],
  );
  const { summary } = useDiffSummary(noGit ? null : source, revision);
  const summaryLoaded = summary !== null;

  // Core registers a current-checkout thread on its first git call, so the
  // list names this thread's branch once a summary has come back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `summaryLoaded` and `revision` are refetch triggers
  useEffect(() => {
    if (noGit || !client.git.worktreeList) return;
    let active = true;
    void client.git
      .worktreeList()
      .then((worktrees: WorktreeInfo[]) => {
        if (!active) return;
        const info = worktrees.find((item) => item.thread_id === sessionId);
        setBase(worktree ? (info?.base ?? "HEAD") : "HEAD");
        setCheckoutBranch(info?.branch || null);
      })
      .catch(() => {
        if (active) setBase("HEAD");
      });
    return () => {
      active = false;
    };
  }, [client, sessionId, worktree, noGit, summaryLoaded, revision]);
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

  const branch = branchName || checkoutBranch;

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
      className={`flex min-w-0 flex-wrap items-center gap-md ${className ?? ""}`}
    >
      <span
        title={branch ?? undefined}
        className="inline-flex h-6 min-w-0 max-w-64 items-center gap-1.5 rounded-sm border border-(--tethys-hairline) bg-(--tethys-surface-card) px-2 font-mono text-mono-micro text-(--tethys-text-primary)"
      >
        <GitBranch
          aria-hidden="true"
          className="size-3.5 shrink-0 text-(--tethys-text-muted)"
        />
        <span className="truncate">{branch ?? "detached"}</span>
      </span>
      <span className="text-label-sm text-(--tethys-text-muted)">
        {worktree ? "worktree" : "checkout"} · vs{" "}
        <span className="font-mono">{worktree ? base : "HEAD"}</span>
      </span>
      {summary && summary.files.length > 0 && (
        <button
          type="button"
          aria-label={`${summary.files.length} changed file${summary.files.length === 1 ? "" : "s"}: review`}
          onClick={() => (openChanges ?? open)()}
          className="focus-ring inline-flex h-6 items-center gap-1.5 rounded-sm px-1.5 font-mono text-mono-micro transition-colors hover:bg-(--tethys-surface-hover)"
        >
          <span className="text-(--tethys-text-secondary)">
            {summary.files.length} file{summary.files.length === 1 ? "" : "s"}
          </span>
          <span className="text-diff-added">+{summary.additions}</span>
          <span className="text-diff-removed">−{summary.deletions}</span>
        </button>
      )}
      <span className="ml-auto flex items-center gap-sm">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => (openChanges ?? open)()}
        >
          <FileText aria-hidden="true" className="size-3.5" />
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
              <GitCommit aria-hidden="true" className="size-3.5" />
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
