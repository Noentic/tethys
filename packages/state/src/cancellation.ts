import type { CancelPhase, CancelState } from "@tethys/bindings";

import type { CancellationState } from "./reducers";

/**
 * The schema's kebab-case `CancelPhase` mapped onto the store's existing
 * snake_case `CancellationState`, in exactly one place. Typed against the
 * generated `CancelPhase`, so a schema change is a compile error.
 */
export interface CancelPhaseView {
  state: CancellationState;
  graceDeadline: string | null;
}

export function cancelPhaseToState(phase: CancelPhase): CancelPhaseView {
  switch (phase.phase) {
    case "idle":
      return { state: "idle", graceDeadline: null };
    case "cancel-requested":
      return {
        state: "cancel_requested",
        graceDeadline: phase.grace_deadline,
      };
    case "grace-elapsed":
      return { state: "grace_elapsed", graceDeadline: null };
    case "terminating":
      return { state: "terminating", graceDeadline: null };
  }
}

/** Fixed base instant and 5 000 ms grace, so the fill's width is deterministic. */
export const CANCEL_FIXTURE_BASE_INSTANT = "2026-09-20T12:00:00Z";
export const CANCEL_FIXTURE_GRACE_MS = 5_000;
export const CANCEL_FIXTURE_DEADLINE = "2026-09-20T12:00:05Z";

export const cancelPhaseFixtures: Record<CancelPhase["phase"], CancelState> = {
  idle: { thread_id: "fixture-thread", phase: { phase: "idle" } },
  "cancel-requested": {
    thread_id: "fixture-thread",
    phase: {
      phase: "cancel-requested",
      grace_deadline: CANCEL_FIXTURE_DEADLINE,
    },
  },
  "grace-elapsed": {
    thread_id: "fixture-thread",
    phase: { phase: "grace-elapsed" },
  },
  terminating: {
    thread_id: "fixture-thread",
    phase: { phase: "terminating" },
  },
};
