import type { ToolCallEntry } from "@tethys/state";
import { Chip, cn, StatusDot } from "@tethys/ui";
import { useId, useState } from "react";
import { ToolOriginTag } from "./tool-origin-tag";

const STATUS_KEY: Record<ToolCallEntry["status"], string> = {
  Pending: "idle",
  Executing: "running",
  Completed: "healthy",
  Failed: "error",
};

const KIND_GLYPH: Record<string, string> = {
  read: "▤",
  edit: "✎",
  delete: "␡",
  move: "⇄",
  search: "⌕",
  execute: "▷",
  think: "◌",
  fetch: "↧",
  switch_mode: "⇋",
  other: "◆",
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
  const [expanded, setExpanded] = useState(
    entry.status === "Failed" || entry.status === "Pending",
  );
  const regionId = useId();
  const output = entry.output ?? "";
  const capped = output.length > OUTPUT_CAP;
  const shownLocations = entry.locations.slice(0, LOCATION_CAP);
  const moreLocations = entry.locations.length - shownLocations.length;

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
        <span aria-hidden="true">
          {KIND_GLYPH[entry.toolKind ?? "other"] ?? KIND_GLYPH.other}
        </span>
        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        <span className="truncate text-label-md text-(--tethys-text-primary)">
          {entry.title}
        </span>
        <ToolOriginTag origin={entry.origin} />
        {entry.status === "Failed" && (
          <span className="text-label-sm text-(--tethys-status-danger)">
            Failed
          </span>
        )}
        {entry.locations.length > 0 && (
          <span className="ml-auto font-mono text-mono-micro text-(--tethys-text-muted)">
            {entry.locations.length} file
            {entry.locations.length === 1 ? "" : "s"}
          </span>
        )}
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
          {entry.input && (
            <pre className="overflow-x-auto font-mono text-mono-code text-(--tethys-text-secondary)">
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
        </div>
      )}
    </div>
  );
}
