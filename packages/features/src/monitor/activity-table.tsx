//! Activity table (spec §5.2.1, MON-01 UI): per-thread process tree plus the
//! two-layer cancellation ladder presentation.
//!
//! A semantic `<table>` with roving tabindex — not `@tanstack/react-table`: no
//! sort/filter/pagination/virtualization is in MVP scope (overview D5).

import type { ProcessSample } from "@tethys/bindings";
import { EmptyState } from "@tethys/ui";
import { useState } from "react";
import { ProcessRow } from "./process-row";

/** The store's snake_case cancel phase; only the last two are destructive. */
export type CancelLadderPhase =
  | "idle"
  | "cancel_requested"
  | "grace_elapsed"
  | "terminating"
  | null;

export function isDestructivePhase(phase: CancelLadderPhase): boolean {
  return phase === "grace_elapsed" || phase === "terminating";
}

export interface ActivityTableProps {
  samples: ProcessSample[];
  cancelPhase?: CancelLadderPhase;
  onRestart?: () => void;
  /** Heading; the Provider's name when several tables are shown together. */
  title?: string;
  className?: string;
}

export function ActivityTable({
  samples,
  cancelPhase = null,
  onRestart,
  title = "Activity",
  className,
}: ActivityTableProps): React.ReactElement {
  const [activeIndex, setActiveIndex] = useState(0);
  const destructive = isDestructivePhase(cancelPhase);

  if (samples.length === 0) {
    return (
      <div className={className} data-testid="activity-table">
        <EmptyState
          title="No active processes"
          description="Process activity appears here while a thread is running."
        />
      </div>
    );
  }

  const move = (delta: number) => {
    setActiveIndex((index) =>
      Math.min(samples.length - 1, Math.max(0, index + delta)),
    );
  };

  return (
    <div className={className} data-testid="activity-table">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-label-md text-(--tethys-text-secondary)">
          {title}
        </span>
        {onRestart && (
          <button
            type="button"
            onClick={onRestart}
            className="focus-ring rounded-xs px-2 py-0.5 text-label-md text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)"
          >
            Restart
          </button>
        )}
      </div>
      <table
        aria-label={`Process activity: ${title}`}
        className="w-full border-collapse"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            move(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            move(-1);
          }
        }}
      >
        <thead>
          <tr className="text-left text-label-sm text-(--tethys-text-muted)">
            <th scope="col" className="px-3 py-1 font-normal">
              PID
            </th>
            <th scope="col" className="px-3 py-1 font-normal">
              CPU
            </th>
            <th scope="col" className="px-3 py-1 font-normal">
              Memory
            </th>
            <th scope="col" className="px-3 py-1 font-normal">
              Uptime
            </th>
            <th scope="col" className="px-3 py-1 font-normal">
              State
            </th>
          </tr>
        </thead>
        <tbody>
          {samples.map((sample, index) => (
            <ProcessRow
              key={sample.pid}
              sample={sample}
              destructive={destructive && !sample.leader}
              className={
                index === activeIndex
                  ? "bg-(--tethys-surface-hover) outline-none"
                  : undefined
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
