import type { ToolCallEntry } from "@tethys/state";
import { Button, Chip, cn, StatusDot } from "@tethys/ui";
import { useEffect, useId, useState } from "react";
import { useInspectorClient } from "../../client-context";
import { useSessionState } from "../use-session-state";
import { diffForTool, InlineFileDiff } from "./file-diff";
import { DisclosureChevron, ToolKindIcon } from "./tool-kind-icon";
import { ToolOriginTag } from "./tool-origin-tag";

const STATUS_KEY: Record<ToolCallEntry["status"], string> = {
  Pending: "idle",
  Executing: "running",
  Completed: "healthy",
  Failed: "error",
  Cancelled: "idle",
};

const OUTPUT_CAP = 1200;
const LOCATION_CAP = 3;

/**
 * A collapsible tool-call card, patched in place as the call updates. The kind
 * glyph is decoration; the title carries the meaning. A failed call writes the
 * word `Failed` beside the dot so failure is never colour alone.
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
  const diff = diffForTool(entry);
  const inspector = useInspectorClient();
  const session = useSessionState(inspector?.threadId ?? "");
  const canStop = Boolean(
    entry.asyncTaskId &&
      session.capabilities?.provider_extensions?.async_tasks &&
      inspector?.client.thread?.providerControl,
  );
  const [expanded, setExpanded] = useState(
    entry.status === "Failed" ||
      entry.status === "Pending" ||
      diff !== null ||
      canStop,
  );
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const regionId = useId();
  const output = entry.output ?? "";
  const capped = output.length > OUTPUT_CAP;
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
      className={cn(
        "rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-nested)",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-sm px-md py-sm text-left transition-colors hover:bg-(--tethys-surface-hover)"
      >
        <StatusDot status={STATUS_KEY[entry.status]} inline />
        <DisclosureChevron
          expanded={expanded}
          className="text-(--tethys-text-muted)"
        />
        <ToolKindIcon
          kind={entry.toolKind}
          className="text-(--tethys-text-secondary)"
        />
        <span className="truncate text-label-md text-(--tethys-text-primary)">
          {entry.title}
        </span>
        <ToolOriginTag origin={entry.origin} />
        {entry.status === "Failed" && (
          <span className="text-label-sm text-(--tethys-status-danger)">
            Failed
          </span>
        )}
        {entry.status === "Cancelled" && (
          <span className="text-label-sm text-(--tethys-text-muted)">
            Stopped
          </span>
        )}
        {entry.locations.length > 0 && (
          <span className="ml-auto font-mono text-mono-micro text-(--tethys-text-muted)">
            {entry.locations.length} file
            {entry.locations.length === 1 ? "" : "s"}
          </span>
        )}
        {Object.entries(entry.diffStats ?? {}).map(([path, stats]) => (
          <span
            key={path}
            role="img"
            title={path || "File diff"}
            aria-label={`${path || "File diff"}: ${stats.added} lines added, ${stats.removed} lines removed`}
            className="ml-auto font-mono text-mono-micro text-(--tethys-text-muted)"
          >
            +{stats.added} −{stats.removed}
          </span>
        ))}
      </button>
      {entry.locations.length > 0 && (
        <div className="flex flex-wrap gap-1 px-md pb-sm">
          {shownLocations.map((location) => (
            <Chip
              key={`${location.path}:${location.line ?? ""}`}
              interactive
              onClick={() => onOpenLocation?.(location.path, location.line)}
            >
              {location.line === null
                ? location.path
                : `${location.path}:${location.line}`}
            </Chip>
          ))}
          {moreLocations > 0 && <Chip>+{moreLocations}</Chip>}
        </div>
      )}
      {expanded && (
        <div
          id={regionId}
          className="border-t border-(--tethys-hairline) px-md py-sm"
        >
          <InlineFileDiff diff={diff} />
          {canStop && (
            <div className="mb-sm flex items-center gap-sm">
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
          {entry.input && (
            <pre
              className={cn(
                "overflow-x-auto font-mono text-mono-code text-(--tethys-text-secondary)",
                diff && "mt-sm",
              )}
            >
              {entry.input}
            </pre>
          )}
          {output && (
            <pre className="mt-sm max-h-64 overflow-auto rounded-sm bg-(--tethys-surface-sunken) p-sm font-mono text-mono-code text-(--tethys-text-on-sunken-secondary)">
              {capped ? output.slice(0, OUTPUT_CAP) : output}
            </pre>
          )}
          {capped && (
            <button
              type="button"
              className="mt-1 text-label-sm text-(--tethys-text-muted) underline"
            >
              View full
            </button>
          )}
          {entry.metadata && (
            <details className="mt-sm rounded-sm border border-(--tethys-hairline) px-sm py-xs">
              <summary className="cursor-pointer text-label-sm text-(--tethys-text-muted)">
                Provider metadata
              </summary>
              <pre className="mt-xs max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-mono-micro text-(--tethys-text-muted)">
                {entry.metadata}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
