import {
  type SessionEntry,
  selectTurnActionsVisible,
  type TurnEndEntry,
  type ToolCallEntry,
} from "@tethys/state";
import { cn, getEntryRenderer } from "@tethys/ui";
import { ProviderCapabilityNotice } from "../providers/capability-notice";
import { buildToolRun, type ToolRun } from "./group-runs";
import { indexChildren } from "./nest-children";
import { SubagentCard } from "./renderers/subagent-card";
import { ToolRunGroup } from "./renderers/tool-run-group";
import { useToolCallDensity } from "./tool-call-density";
import { TurnReceipt } from "./turn-receipt";

type StageSegment =
  | { type: "entry"; entry: SessionEntry }
  | { type: "run"; run: ToolRun }
  | { type: "subagent"; entry: ToolCallEntry };

function isSubagentParent(entry: SessionEntry): entry is ToolCallEntry {
  return (
    entry.kind === "tool_call" &&
    (entry as ToolCallEntry).origin?.kind === "subagent"
  );
}

function isTurnEndEntry(entry: SessionEntry): entry is TurnEndEntry {
  return (
    entry.kind === "turn_end" &&
    "turn" in entry &&
    typeof entry.turn === "number"
  );
}

function segmentEntries(
  entries: SessionEntry[],
  density: "summary" | "full",
): StageSegment[] {
  const { childIds, orphanIds } = indexChildren(entries);
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
    if (isSubagentParent(entry)) {
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
 * its children. File actions render only for file mutations and only where
 * the capability set allows.
 */
export function TranscriptStage({
  entries,
  capabilities,
  sessionId,
  onOpenLocation,
  className,
}: {
  entries: SessionEntry[];
  capabilities: import("@tethys/bindings").WorkspaceCapabilities | null;
  sessionId?: string;
  onOpenLocation?: (path: string, line: number | null) => void;
  className?: string;
}) {
  const actions = selectTurnActionsVisible(capabilities);
  const density = useToolCallDensity();
  const childIndex = indexChildren(entries);
  const segments = segmentEntries(entries, density);

  return (
    <div
      data-testid="transcript-stage"
      className={cn(
        "flex w-full flex-col items-center gap-lg px-4 pt-5",
        className,
      )}
    >
      {segments.map((segment) => {
        if (segment.type === "run") {
          return (
            <div
              key={segment.run.id}
              data-entry-id={segment.run.id}
              className="w-full max-w-[720px]"
            >
              <ToolRunGroup run={segment.run} onOpenLocation={onOpenLocation} />
            </div>
          );
        }
        if (segment.type === "subagent") {
          return (
            <div
              key={segment.entry.id}
              data-entry-id={segment.entry.id}
              className="w-full max-w-[720px]"
            >
              <SubagentCard entry={segment.entry} index={childIndex} />
            </div>
          );
        }
        const entry = segment.entry;
        if (isTurnEndEntry(entry)) {
          return sessionId ? (
            <div
              key={entry.id}
              data-entry-id={entry.id}
              className="w-full max-w-[720px]"
            >
              <TurnReceipt
                sessionId={sessionId}
                turn={entry.turn}
                canRestore={actions.restore}
                canReview={actions.viewDiff}
              />
            </div>
          ) : null;
        }
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
              className="w-full max-w-[720px] flex items-center gap-sm text-label-sm text-(--tethys-text-muted)"
            >
              <span className="h-px flex-1 bg-(--tethys-hairline)" />
              {(entry as { label: string }).label}
              <span className="h-px flex-1 bg-(--tethys-hairline)" />
            </div>
          );
        }
        const Renderer = getEntryRenderer(entry.kind);
        const isUserMessage =
          entry.kind === "turn_message" &&
          "role" in entry &&
          entry.role === "User";
        return (
          <div
            key={entry.id}
            data-entry-id={entry.id}
            className={cn(
              "w-full max-w-[720px]",
              isUserMessage && "flex justify-end",
            )}
          >
            {childIndex.orphanIds.has(entry.id) && (
              <ProviderCapabilityNotice
                provider="This Provider"
                capability="recover the parent subagent context"
                message="Subagent context unavailable"
              />
            )}
            <Renderer entry={entry} />
          </div>
        );
      })}
    </div>
  );
}
