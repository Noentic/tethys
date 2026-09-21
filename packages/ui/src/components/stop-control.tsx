import { useEffect, useMemo, useState } from "react";
import { cn } from "../lib/utils";

/** Structurally the store's `CancellationState`, without importing it. */
export type StopPhase =
  | "idle"
  | "cancel_requested"
  | "grace_elapsed"
  | "terminating";

export interface StopControlProps {
  phase: StopPhase;
  graceDeadline?: string | null;
  onStop?: () => void;
  className?: string;
}

const LABELS: Record<StopPhase, string> = {
  idle: "Stop",
  cancel_requested: "Cancelling…",
  grace_elapsed: "Force kill",
  terminating: "Terminating (SIGKILL)",
};

const ANNOUNCEMENTS: Record<StopPhase, string> = {
  idle: "",
  cancel_requested: "Cancelling",
  grace_elapsed: "Force kill available",
  terminating: "Terminating",
};

/**
 * DESIGN.md `stop-control` — four phases off the cancel-state contract.
 * The pending fill is a width transition set from the backend's deadline, not
 * an animation loop, so it is unaffected by reduced motion.
 */
export function StopControl({
  phase,
  graceDeadline = null,
  onStop,
  className,
}: StopControlProps) {
  const [depleted, setDepleted] = useState(false);

  const remainingMs = useMemo(() => {
    if (phase !== "cancel_requested" || !graceDeadline) return 0;
    return Math.max(0, new Date(graceDeadline).getTime() - Date.now());
  }, [phase, graceDeadline]);

  useEffect(() => {
    if (phase !== "cancel_requested") {
      // Reset so the next window mounts its fill at 100% and depletes once.
      setDepleted(false);
      return;
    }
    const raf = requestAnimationFrame(() => setDepleted(true));
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const isPending = phase === "cancel_requested";
  const isTerminating = phase === "terminating";
  const isDestructive = phase === "grace_elapsed" || isTerminating;
  const isNonInteractive = isPending || isTerminating;

  return (
    <button
      type="button"
      disabled={isNonInteractive}
      aria-busy={isPending || isTerminating}
      onClick={isNonInteractive ? undefined : onStop}
      className={cn(
        "focus-ring relative inline-flex h-7 shrink-0 items-center justify-center overflow-hidden rounded-sm px-3.5 text-label-md transition-colors select-none",
        isDestructive
          ? "border border-(--tethys-status-danger) text-(--tethys-status-danger) bg-(--tethys-status-danger-soft)"
          : "border border-(--tethys-hairline-strong) bg-(--tethys-surface-elevated) text-(--tethys-text-primary) hover:bg-(--tethys-surface-card-hover)",
        isNonInteractive && "cursor-default",
        className,
      )}
    >
      {isPending && (
        <span
          data-testid="stop-fill"
          aria-hidden="true"
          className="absolute inset-y-0 right-0 bg-(--tethys-surface-active)"
          style={{
            width: depleted ? "0%" : "100%",
            transitionProperty: "width",
            transitionTimingFunction: "linear",
            transitionDuration: `${remainingMs}ms`,
          }}
        />
      )}
      <span className="relative">{LABELS[phase]}</span>
      <span className="sr-only" aria-live="polite">
        {ANNOUNCEMENTS[phase]}
      </span>
    </button>
  );
}
