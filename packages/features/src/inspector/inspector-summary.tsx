import type { SessionEntry, ToolCallEntry } from "@tethys/state";
import {
  useWorkspaceReviewCapability,
  type WorkspaceCapabilityFixture,
} from "@tethys/state";
import { cn } from "@tethys/ui";
import { type ReactNode, useMemo } from "react";
import { defaultDiffSource, useDiffSummary } from "../review/use-review-diff";
import { countActivity } from "./ledger-counts";
import { useSessionState } from "./use-session-state";

const EDIT_KINDS = new Set(["edit", "delete", "move"]);

/** `2m 04s` / `14s`. Whole seconds — a rollup, not a stopwatch. */
function formatDuration(entries: SessionEntry[]): string | null {
  if (entries.length < 2) {
    return null;
  }
  const first = entries[0].timestamp;
  const last = entries[entries.length - 1].timestamp;
  const seconds = Math.max(0, Math.round((last - first) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0
    ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`
    : `${seconds}s`;
}

function distinctEditedPaths(entries: SessionEntry[]): number {
  const paths = new Set<string>();
  for (const entry of entries) {
    if (entry.kind !== "tool_call") {
      continue;
    }
    const call = entry as ToolCallEntry;
    if (!call.toolKind || !EDIT_KINDS.has(call.toolKind)) {
      continue;
    }
    for (const location of call.locations) {
      paths.add(location.path);
    }
  }
  return paths.size;
}

function Metric({
  value,
  label,
  testId,
  className,
}: {
  value: ReactNode;
  label: string;
  testId: string;
  className?: string;
}) {
  return (
    <li className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span
        data-testid={testId}
        className={cn(
          "truncate font-mono text-mono-micro text-(--tethys-text-primary)",
          className,
        )}
      >
        {value}
      </span>
      <span className="truncate font-mono text-mono-micro text-(--tethys-text-muted)">
        {label}
      </span>
    </li>
  );
}

/**
 * The Inspector's rollup band (DESIGN.md `thread-inspector.rollup`): the numbers
 * a whole session produced, gathered above the sections. Every metric comes from
 * something the session actually reported — tool-call entries and the git diff
 * summary — and a metric the session did not report is omitted rather than
 * estimated (P9).
 *
 * The diff stat is two colours, never one: `+N` in `diff-added`, `−N` in
 * `diff-removed`. A single-coloured stat makes the reader parse the sign to tell
 * the sides apart.
 */
export function InspectorSummary({
  sessionId,
  capabilityFixture = "git-remote",
  className,
}: {
  sessionId?: string;
  capabilityFixture?: WorkspaceCapabilityFixture;
  className?: string;
}) {
  const state = useSessionState(sessionId ?? "");
  const gate = useWorkspaceReviewCapability(capabilityFixture);
  const source = useMemo(() => defaultDiffSource(sessionId ?? ""), [sessionId]);
  const { summary } = useDiffSummary(gate.showDiff ? source : null);

  const entries = state.entries;
  const counts = useMemo(() => countActivity(entries), [entries]);
  const commands =
    counts.rows.find((row) => row.id === "execute")?.items.length ?? 0;
  const modified = summary
    ? summary.files.length
    : distinctEditedPaths(entries);
  const duration = formatDuration(entries);

  const hasAnything =
    summary !== null || commands > 0 || modified > 0 || duration !== null;
  if (!sessionId || !hasAnything) {
    return null;
  }

  return (
    <ul
      data-testid="inspector-summary"
      aria-label="Session rollup"
      className={cn(
        "flex w-full list-none items-stretch gap-md rounded-md bg-(--tethys-surface-overlay) px-md py-sm",
        className,
      )}
    >
      <Metric
        testId="summary-files"
        value={`${modified} file${modified === 1 ? "" : "s"}`}
        label="Modified"
      />
      {summary && (
        <Metric
          testId="summary-diff-lines"
          value={
            <>
              <span className="text-diff-added">+{summary.additions}</span>{" "}
              <span className="text-diff-removed">−{summary.deletions}</span>
            </>
          }
          label="Diff lines"
        />
      )}
      <Metric
        testId="summary-commands"
        value={`${commands} cmd${commands === 1 ? "" : "s"}`}
        label="Executed"
      />
      {duration !== null && (
        <Metric testId="summary-duration" value={duration} label="Duration" />
      )}
    </ul>
  );
}
