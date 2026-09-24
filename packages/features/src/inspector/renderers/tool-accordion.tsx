import { DiffStat } from "@tethys/diff";
import type { ToolCallEntry } from "@tethys/state";
import {
  Button,
  Chip,
  cn,
  StatusDot,
  TruncatedText,
  useInspectorControl,
} from "@tethys/ui";
import { useEffect, useId, useMemo, useState } from "react";
import { useInspectorClient } from "../../client-context";
import { toolDiffs, toolHeadline } from "../tool-view";
import { useSessionState } from "../use-session-state";
import { ToolBody } from "./tool-bodies";
import { DisclosureChevron, ToolKindIcon } from "./tool-kind-icon";
import { ToolOriginTag } from "./tool-origin-tag";

const STATUS_KEY: Record<ToolCallEntry["status"], string> = {
  Pending: "idle",
  Executing: "running",
  Completed: "healthy",
  Failed: "error",
  Cancelled: "idle",
};

const LOCATION_CAP = 3;
const FILE_KINDS = ["edit", "delete", "move"];

/** `+a −b` across every file the call changed, from its diffs or its stats. */
function callStat(
  entry: ToolCallEntry,
  diffs: ReturnType<typeof toolDiffs>,
): { additions: number; deletions: number } | null {
  if (diffs.length > 0) {
    return diffs.reduce(
      (sum, diff) => ({
        additions: sum.additions + diff.additions,
        deletions: sum.deletions + diff.deletions,
      }),
      { additions: 0, deletions: 0 },
    );
  }
  const stats = Object.values(entry.diffStats ?? {});
  if (stats.length === 0) return null;
  return stats.reduce(
    (sum, stat) => ({
      additions: sum.additions + stat.added,
      deletions: sum.deletions + stat.removed,
    }),
    { additions: 0, deletions: 0 },
  );
}

/**
 * A tool call as one card, patched in place as the call updates (DESIGN.md
 * `tool-accordion`). The header names the act and its object — `Edited
 * README.md +3 −1`, `Ran pnpm test` — and the body is shaped by the kind of
 * work (`ToolBody`). A failed call writes `Failed` beside the dot, so failure
 * is never colour alone; a failed or waiting call opens itself.
 */
export function ToolAccordionRenderer({
  entry,
  className,
  onOpenLocation,
}: {
  entry: ToolCallEntry;
  className?: string;
  onOpenLocation?: (path: string, line: number | null) => void;
}) {
  const diffs = useMemo(() => toolDiffs(entry), [entry]);
  const headline = toolHeadline(entry);
  const stat = callStat(entry, diffs);
  const inspector = useInspectorClient();
  const { openChanges } = useInspectorControl();
  const session = useSessionState(inspector?.threadId ?? "");
  const canStop = Boolean(
    entry.asyncTaskId &&
      session.capabilities?.provider_extensions?.async_tasks &&
      inspector?.client.thread?.providerControl,
  );
  const [expanded, setExpanded] = useState(
    entry.status === "Failed" ||
      entry.status === "Pending" ||
      diffs.length > 0 ||
      canStop,
  );
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const regionId = useId();
  // A file edit names its file in the header and its diff; chips would repeat it.
  const showLocations =
    entry.locations.length > 0 && !FILE_KINDS.includes(entry.toolKind ?? "");
  const shownLocations = entry.locations.slice(0, LOCATION_CAP);
  const moreLocations = entry.locations.length - shownLocations.length;

  useEffect(() => {
    if (canStop) setExpanded(true);
  }, [canStop]);

  const stopTask = async () => {
    const providerControl = inspector?.client.thread?.providerControl;
    if (!providerControl || !entry.asyncTaskId || stopping) return;
    setStopping(true);
    setStopError(null);
    try {
      await providerControl(inspector.threadId, {
        kind: "stop-async-task",
        async_task_id: entry.asyncTaskId,
      });
    } catch (error) {
      setStopError(error instanceof Error ? error.message : String(error));
    } finally {
      setStopping(false);
    }
  };

  return (
    <div
      data-entry-kind="tool_call"
      data-tool-call-id={entry.toolCallId}
      data-tool-kind={entry.toolKind ?? "other"}
      className={cn(
        "min-w-0 rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-nested)",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((value) => !value)}
        className="focus-ring-inset flex min-h-9 w-full min-w-0 items-center gap-sm rounded-md px-md py-1.5 text-left transition-colors hover:bg-(--tethys-surface-hover)"
      >
        <StatusDot status={STATUS_KEY[entry.status]} inline />
        <DisclosureChevron
          expanded={expanded}
          className="shrink-0 text-(--tethys-text-muted)"
        />
        <ToolKindIcon
          kind={entry.toolKind}
          className="shrink-0 text-(--tethys-text-secondary)"
        />
        {headline.verb && (
          <span className="shrink-0 text-label-md text-(--tethys-text-secondary)">
            {headline.verb}
          </span>
        )}
        <TruncatedText
          text={headline.subject}
          className={cn(
            "text-(--tethys-text-primary)",
            headline.mono ? "font-mono text-mono-code" : "text-label-md",
          )}
        />
        <ToolOriginTag origin={entry.origin} />
        {entry.status === "Failed" && (
          <span className="shrink-0 text-label-sm text-(--tethys-status-danger)">
            Failed
          </span>
        )}
        {entry.status === "Cancelled" && (
          <span className="shrink-0 text-label-sm text-(--tethys-text-muted)">
            Stopped
          </span>
        )}
        {stat && (
          <span
            role="img"
            aria-label={`${stat.additions} lines added, ${stat.deletions} lines removed`}
            className="ml-auto"
          >
            <DiffStat additions={stat.additions} deletions={stat.deletions} />
          </span>
        )}
      </button>
      {showLocations && (
        <div className="flex flex-wrap gap-1 px-md pb-sm">
          {shownLocations.map((location) => (
            <Chip
              key={`${location.path}:${location.line ?? ""}`}
              interactive
              onClick={() => onOpenLocation?.(location.path, location.line)}
            >
              <TruncatedText
                mode="path"
                className="max-w-64"
                text={
                  location.line === null
                    ? location.path
                    : `${location.path}:${location.line}`
                }
              />
            </Chip>
          ))}
          {moreLocations > 0 && <Chip>+{moreLocations}</Chip>}
        </div>
      )}
      {expanded && (
        <div
          id={regionId}
          className="flex flex-col gap-sm border-t border-(--tethys-hairline) px-md py-sm"
        >
          {canStop && (
            <div className="flex items-center gap-sm">
              <Button
                size="sm"
                variant="secondary"
                disabled={stopping}
                onClick={() => void stopTask()}
              >
                {stopping ? "Stopping…" : "Stop background task"}
              </Button>
              {stopError && (
                <span
                  role="alert"
                  className="text-body-sm text-(--tethys-status-danger)"
                >
                  {stopError}
                </span>
              )}
            </div>
          )}
          <ToolBody
            entry={entry}
            diffs={diffs}
            onOpenChanges={openChanges ? () => openChanges() : undefined}
          />
        </div>
      )}
    </div>
  );
}
