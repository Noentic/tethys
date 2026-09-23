import {
  useWorkspaceReviewCapability,
  type WorkspaceCapabilityFixture,
} from "@tethys/state";
import { cn, useInspectorControl } from "@tethys/ui";
import { useMemo } from "react";
import { defaultDiffSource, useDiffSummary } from "./use-review-diff";

/**
 * DESIGN.md `prompt-card.contextBarFold` for the D6 diff-summary pill: between the
 * Provider/config pill (60) and the mode pill (40), so it folds after the queue
 * count and the mode pill and before `Stop` and the isolation pill.
 */
export const DIFF_SUMMARY_PRIORITY = 50;

export interface DiffSummaryPillProps {
  sessionId?: string;
  capabilityFixture?: WorkspaceCapabilityFixture;
  className?: string;
}

/**
 * The D6 diff-summary pill. Shows changed-file count and `+a −b` only — never a
 * staged-hunk count, because `git.stage` is path-level — and opens the
 * Inspector where `Approve & Commit` lives.
 */
export function DiffSummaryPill({
  sessionId = "",
  capabilityFixture,
  className,
}: DiffSummaryPillProps) {
  const gate = useWorkspaceReviewCapability(sessionId, capabilityFixture);
  const { open } = useInspectorControl();
  const source = useMemo(() => defaultDiffSource(sessionId), [sessionId]);
  const { summary } = useDiffSummary(gate.showDiff ? source : null);

  if (!gate.showDiff || summary === null || summary.files.length === 0) {
    return null;
  }

  return (
    <button
      type="button"
      data-testid="diff-summary-pill"
      onClick={() => open()}
      className={cn(
        "focus-ring inline-flex items-center gap-1.5 rounded-xs border border-(--tethys-hairline-strong) px-2 py-0.5 font-mono text-mono-micro text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)",
        className,
      )}
    >
      <span>
        {summary.files.length} file{summary.files.length === 1 ? "" : "s"}
      </span>
      <span className="text-diff-added">+{summary.additions}</span>
      <span className="text-diff-removed">−{summary.deletions}</span>
    </button>
  );
}
