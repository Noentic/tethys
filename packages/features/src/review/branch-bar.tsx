import { FileText, GitBranch, GitCommit } from "@nebutra/icons";
import type { DiffSource, WorktreeInfo } from "@tethys/bindings";
import { Badge, Button, cn, Popover, useInspectorControl } from "@tethys/ui";
import type React from "react";
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
  /** Session actions that sit at the strip's end, such as `Fork`. */
  trailing?: React.ReactNode;
  className?: string;
}

// branch-bar (DESIGN.md): a strip docked above the prompt card, outside it, so
// git context stays beside the input without crowding the input itself.
const STRIP_CLASS =
  "@container flex min-h-9 min-w-0 items-center gap-sm rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-panel) py-1 pr-1 pl-2";

/** Git context and the only entry point for committing a thread's changes. */
export function BranchBar({
  sessionId,
  branchName,
  worktree = false,
  noGit = false,
  turnRunning = false,
  trailing,
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
        className={cn(STRIP_CLASS, className)}
      >
        <Badge variant="muted">no git · no revert</Badge>
        {trailing && (
          <span className="ml-auto flex shrink-0 items-center">{trailing}</span>
        )}
      </div>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label="Branch actions"
      data-testid="branch-bar"
      className={cn(STRIP_CLASS, className)}
    >
      <span
        title={branch ?? undefined}
        className="inline-flex min-h-6 min-w-0 max-w-48 shrink items-center gap-1.5 rounded-sm border border-(--tethys-hairline) bg-(--tethys-surface-card) px-2 font-mono text-mono-micro text-(--tethys-text-primary)"
      >
        <GitBranch
          aria-hidden="true"
          className="size-3.5 shrink-0 text-(--tethys-text-muted)"
        />
        <span className="truncate">{branch ?? "detached"}</span>
      </span>
      <span className="hidden shrink-0 text-label-sm text-(--tethys-text-muted) @lg:inline">
        {worktree ? "worktree" : "checkout"} · vs{" "}
        <span className="font-mono">{worktree ? base : "HEAD"}</span>
      </span>
      {summary && summary.files.length > 0 && (
        <button
          type="button"
          aria-label={`${summary.files.length} changed file${summary.files.length === 1 ? "" : "s"}: review`}
          onClick={() => (openChanges ?? open)()}
          className="focus-ring inline-flex min-h-6 shrink-0 items-center gap-1.5 rounded-sm px-1.5 font-mono text-mono-micro whitespace-nowrap transition-colors hover:bg-(--tethys-surface-hover)"
        >
          <span className="hidden text-(--tethys-text-secondary) @sm:inline">
            {summary.files.length} file{summary.files.length === 1 ? "" : "s"}
          </span>
          <span className="text-diff-added">+{summary.additions}</span>
          <span className="text-diff-removed">−{summary.deletions}</span>
        </button>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-xs">
        <Button
          size="sm"
          variant="ghost"
          aria-label="Review"
          onClick={() => (openChanges ?? open)()}
        >
          <FileText aria-hidden="true" className="size-3.5" />
          <span className="hidden @md:inline">Review</span>
        </Button>
        {committed ? (
          <>
            <span className="truncate font-mono text-mono-micro text-(--tethys-status-success)">
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
              side="top"
              align="end"
              className="w-80"
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
        {trailing}
      </span>
    </div>
  );
}
