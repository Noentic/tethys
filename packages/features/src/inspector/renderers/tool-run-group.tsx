import { DiffStat } from "@tethys/diff";
import { ActivityOrb, cn, TruncatedText } from "@tethys/ui";
import { useEffect, useId, useMemo, useState } from "react";
import { isFileMutation, type ToolRun } from "../group-runs";
import { toolDiffs, toolHeadline } from "../tool-view";
import { DisclosureChevron } from "./disclosure-chevron";
import { ToolAccordionRenderer } from "./tool-accordion";

/**
 * Collapses a run of consecutive tool calls into one summary row (DESIGN.md
 * `tool-run-group`). Only a failure opens it; a call waiting on the user is
 * answered in the request dock above the composer, not here.
 */
export function ToolRunGroup({
  run,
  className,
  onOpenLocation,
}: {
  run: ToolRun;
  className?: string;
  onOpenLocation?: (path: string, line: number | null) => void;
}) {
  const [expanded, setExpanded] = useState(run.hasFailure);
  const regionId = useId();
  // The run's edits carry their size on the summary row (P17), so a large
  // change is visible without opening the run.
  const stat = useMemo(() => {
    const diffs = run.members.filter(isFileMutation).flatMap(toolDiffs);
    if (diffs.length === 0) return null;
    return diffs.reduce(
      (sum, diff) => ({
        additions: sum.additions + diff.additions,
        deletions: sum.deletions + diff.deletions,
      }),
      { additions: 0, deletions: 0 },
    );
  }, [run.members]);
  const inFlight = run.members.find(
    (member) => member.status === "Executing" || member.status === "Pending",
  );
  const inFlightHeadline = inFlight ? toolHeadline(inFlight) : null;
  const label =
    run.isLive && inFlightHeadline
      ? [inFlightHeadline.verb, inFlightHeadline.subject]
          .filter(Boolean)
          .join(" ")
      : run.summary;

  useEffect(() => {
    if (run.hasFailure) setExpanded(true);
  }, [run.hasFailure]);

  return (
    <div
      data-entry-kind="tool_run_group"
      data-run-id={run.id}
      className={cn("rounded-md", className)}
    >
      <button
        type="button"
        data-testid="tool-run-group-row"
        aria-expanded={expanded}
        aria-controls={regionId}
        aria-busy={run.isLive || undefined}
        onClick={() => setExpanded((value) => !value)}
        className="focus-ring-inset flex min-h-7 w-full min-w-0 items-center gap-sm rounded-sm px-2 text-left text-body-sm text-(--tethys-text-secondary) transition-colors hover:bg-(--tethys-surface-hover)"
      >
        {run.isLive && (
          <ActivityOrb size={14} className="text-(--tethys-text-muted)" />
        )}
        <TruncatedText text={label} />
        {stat && (
          <DiffStat additions={stat.additions} deletions={stat.deletions} />
        )}
        <DisclosureChevron
          expanded={expanded}
          className="ml-auto shrink-0 text-(--tethys-text-muted)"
        />
      </button>
      {expanded && (
        <div id={regionId} className="mt-1 flex flex-col gap-1 pl-md">
          {run.members.map((member) => (
            <ToolAccordionRenderer
              key={member.id}
              entry={member}
              onOpenLocation={onOpenLocation}
            />
          ))}
        </div>
      )}
    </div>
  );
}
