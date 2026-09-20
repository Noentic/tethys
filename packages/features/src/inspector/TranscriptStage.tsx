import {
  type SessionEntry,
  selectTurnActionsVisible,
  type ToolCallEntry,
} from "@tethys/state";
import { Button, cn, getEntryRenderer } from "@tethys/ui";
import { ProviderCapabilityNotice } from "../providers/capability-notice";
import { buildToolRun, type ToolRun } from "./group-runs";
import { indexChildren } from "./nest-children";
import { SubagentCard } from "./renderers/subagent-card";
import { ToolRunGroup } from "./renderers/tool-run-group";
import { useToolCallDensity } from "./tool-call-density";

type StageSegment =
  | { type: "entry"; entry: SessionEntry }
  | { type: "run"; run: ToolRun }
  | { type: "subagent"; entry: ToolCallEntry };

function isSubagentParent(
  entry: SessionEntry,
  childrenByParent: Map<string, SessionEntry[]>,
): entry is ToolCallEntry {
  return (
    entry.kind === "tool_call" &&
    (entry as ToolCallEntry).origin?.kind === "subagent" &&
    (childrenByParent.get(entry.id)?.length ?? 0) > 0
  );
}

function segmentEntries(
  entries: SessionEntry[],
  density: "summary" | "full",
): StageSegment[] {
  const { childIds, childrenByParent, orphanIds } = indexChildren(entries);
  const segments: StageSegment[] = [];
  let buffer: ToolCallEntry[] = [];

  const flush = () => {
    if (buffer.length === 1) {
      segments.push({ type: "entry", entry: buffer[0] });
    } else if (buffer.length > 1) {
      segments.push({ type: "run", run: buildToolRun(buffer) });
    }
    buffer = [];
  };

  for (const entry of entries) {
    if (childIds.has(entry.id) && !orphanIds.has(entry.id)) {
      continue;
    }
    if (isSubagentParent(entry, childrenByParent)) {
      flush();
      segments.push({ type: "subagent", entry });
      continue;
    }
    if (density === "summary" && entry.kind === "tool_call") {
      buffer.push(entry as ToolCallEntry);
      continue;
    }
    flush();
    segments.push({ type: "entry", entry });
  }
  flush();
  return segments;
}

/**
 * Renders the session's materialized entries through the entry-renderer
 * registry — the same seam `Stage.tsx` uses, so the `Earlier history
 * (read-only)` divider is honoured without new logic. Tool-call runs group in
 * `Summary` density and render individually in `Full`; a subagent call nests
 * its children. Per-turn `View diff` / `Restore` render only where the
 * capability set allows.
 */
export function TranscriptStage({
  entries,
  capabilities,
  onViewDiff,
  onRestore,
  onOpenLocation,
  className,
}: {
  entries: SessionEntry[];
  capabilities: import("@tethys/bindings").WorkspaceCapabilities;
  onViewDiff?: (entry: SessionEntry) => void;
  onRestore?: (entry: SessionEntry) => void;
  onOpenLocation?: (path: string, line: number | null) => void;
  className?: string;
}) {
  const actions = selectTurnActionsVisible(capabilities);
  const density = useToolCallDensity();
  const childIndex = indexChildren(entries);
  const segments = segmentEntries(entries, density);

  const turnActions = (entry: SessionEntry) =>
    entry.kind === "tool_call" && (actions.viewDiff || actions.restore) ? (
      <div data-testid="turn-actions" className="mt-1 flex gap-sm pl-md">
        {actions.viewDiff && (
          <Button size="sm" variant="ghost" onClick={() => onViewDiff?.(entry)}>
            View diff
          </Button>
        )}
        {actions.restore && (
          <Button size="sm" variant="ghost" onClick={() => onRestore?.(entry)}>
            Restore
          </Button>
        )}
      </div>
    ) : null;

  return (
    <div
      data-testid="transcript-stage"
      className={cn("flex flex-col gap-sm", className)}
    >
      {segments.map((segment) => {
        if (segment.type === "run") {
          return (
            <div key={segment.run.id} data-entry-id={segment.run.id}>
              <ToolRunGroup run={segment.run} onOpenLocation={onOpenLocation} />
              {turnActions(segment.run.members[0])}
            </div>
          );
        }
        if (segment.type === "subagent") {
          return (
            <div key={segment.entry.id} data-entry-id={segment.entry.id}>
              <SubagentCard entry={segment.entry} index={childIndex} />
              {turnActions(segment.entry)}
            </div>
          );
        }
        const entry = segment.entry;
        if (entry.kind === "plan") {
          return null;
        }
        if (entry.kind === "history_divider") {
          return (
            // biome-ignore lint/a11y/useSemanticElements: a labelled divider with inline text has no single semantic element
            <div
              key={entry.id}
              role="separator"
              aria-label={(entry as { label: string }).label}
              className="my-sm flex items-center gap-sm text-label-sm text-(--tethys-text-muted)"
            >
              <span className="h-px flex-1 bg-(--tethys-hairline)" />
              {(entry as { label: string }).label}
              <span className="h-px flex-1 bg-(--tethys-hairline)" />
            </div>
          );
        }
        const Renderer = getEntryRenderer(entry.kind);
        return (
          <div key={entry.id} data-entry-id={entry.id}>
            {childIndex.orphanIds.has(entry.id) && (
              <ProviderCapabilityNotice
                provider="This Provider"
                capability="recover the parent subagent context"
                message="Subagent context unavailable"
              />
            )}
            <Renderer entry={entry} />
            {turnActions(entry)}
          </div>
        );
      })}
    </div>
  );
}
