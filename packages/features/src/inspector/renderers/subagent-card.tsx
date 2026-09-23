import type { SessionEntry, ToolCallEntry } from "@tethys/state";
import { cn, getEntryRenderer, StatusDot } from "@tethys/ui";
import { useEffect, useId, useState } from "react";
import type { ChildIndex } from "../nest-children";
import { cardChildren } from "../nest-children";
import { DisclosureChevron } from "./tool-kind-icon";
import { ToolOriginTag } from "./tool-origin-tag";

function awaiting(entry: SessionEntry): boolean {
  return (
    entry.kind === "tool_call" && (entry as ToolCallEntry).status === "Pending"
  );
}

/**
 * A tool call whose origin is `subagent` (DESIGN.md `subagent-card`): the
 * parent row is an accordion, its body is the child transcript rendered through
 * the same registered renderers, indented one level behind a left rule.
 * A child awaiting approval forces the parent open and rings its dot.
 */
export function SubagentCard({
  entry,
  index,
  className,
}: {
  entry: ToolCallEntry;
  index: ChildIndex;
  className?: string;
}) {
  const children = cardChildren(entry.id, index);
  const childEntries = children.map((child) => child.entry);
  const hasAwaiting = childEntries.some(awaiting);
  const [expanded, setExpanded] = useState(hasAwaiting);
  const regionId = useId();
  const dotStatus = hasAwaiting
    ? "awaiting_approval"
    : entry.status === "Executing"
      ? "running"
      : entry.status === "Completed"
        ? "healthy"
        : entry.status === "Failed"
          ? "error"
          : "idle";

  useEffect(() => {
    if (hasAwaiting) {
      setExpanded(true);
    }
  }, [hasAwaiting]);

  const rollup = `${childEntries.length} tool call${
    childEntries.length === 1 ? "" : "s"
  }${hasAwaiting ? " · awaiting permission" : ""}`;

  return (
    <div
      data-entry-kind="subagent_card"
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
        onClick={() => {
          if (!hasAwaiting) {
            setExpanded((value) => !value);
          }
        }}
        className="flex w-full items-center gap-sm px-md py-sm text-left transition-colors hover:bg-(--tethys-surface-hover)"
      >
        <StatusDot status={dotStatus} inline />
        <DisclosureChevron expanded={expanded} />
        <span className="truncate text-label-md text-(--tethys-text-primary)">
          {entry.title}
        </span>
        <ToolOriginTag origin={entry.origin} />
        <span className="ml-auto font-mono text-mono-micro text-(--tethys-text-muted)">
          {rollup}
        </span>
      </button>
      {expanded && (
        <div
          id={regionId}
          className="ml-md border-l-2 border-(--tethys-hairline-strong) py-sm pl-lg"
        >
          {entry.input && (
            <p
              data-testid="subagent-task"
              className="mb-sm whitespace-pre-wrap text-body-sm text-(--tethys-text-muted)"
            >
              {entry.input}
            </p>
          )}
          {entry.output && (
            <pre
              data-testid="subagent-transcript"
              className="mb-sm whitespace-pre-wrap text-body-sm text-(--tethys-text-secondary)"
            >
              {entry.output}
            </pre>
          )}
          {children.map(({ entry: child, depth }) => {
            const Renderer = getEntryRenderer(child.kind);
            return (
              <div key={child.id} className="mb-1">
                {depth > 1 && (
                  <span className="font-mono text-mono-micro text-(--tethys-text-muted)">
                    depth {depth}
                  </span>
                )}
                <Renderer entry={child} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
