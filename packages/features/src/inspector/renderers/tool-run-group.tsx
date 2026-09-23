import { cn } from "@tethys/ui";
import { useEffect, useId, useState } from "react";
import type { ToolRun } from "../group-runs";
import { ToolAccordionRenderer } from "./tool-accordion";
import { DisclosureChevron } from "./tool-kind-icon";

function Spinner() {
  return (
    <svg
      className="h-4 w-4 motion-safe:animate-spin text-(--tethys-text-muted)"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

/**
 * Collapses a run of consecutive tool calls into one summary row (DESIGN.md
 * `tool-run-group`). A run with a failed or awaiting member opens itself and
 * cannot be collapsed while a member awaits — something that asks the user is
 * never made unreachable.
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
  const [expanded, setExpanded] = useState(run.hasFailure || run.hasAwaiting);
  const regionId = useId();

  useEffect(() => {
    if (run.hasFailure || run.hasAwaiting) {
      setExpanded(true);
    }
  }, [run.hasFailure, run.hasAwaiting]);

  const toggle = () => {
    if (run.hasAwaiting && expanded) {
      return;
    }
    setExpanded((value) => !value);
  };

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
        onClick={toggle}
        className="flex h-7 w-full items-center gap-sm rounded-sm px-2 text-left text-body-sm text-(--tethys-text-secondary) transition-colors hover:bg-(--tethys-surface-hover)"
      >
        {run.isLive && <Spinner />}
        <span className="truncate">
          {run.isLive && run.inFlightTitle ? run.inFlightTitle : run.summary}
        </span>
        <DisclosureChevron
          expanded={expanded}
          className="ml-auto text-(--tethys-text-muted)"
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
