export type SessionStatus =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "error"
  | "interrupted"
  | "suspended"
  | "archived";

/**
 * Liveness channel (DESIGN.md motion.stateMotion). Only the states that are
 * genuinely alive breathe, and `awaiting` breathes slower than `running` so
 * waiting reads differently from busy. A state that has stopped must not keep
 * pulsing: an errored or suspended agent that animates reads as still working.
 */
export type StatusMotion = "breathe" | "breatheAwaiting" | "none";

export interface SessionStateInfo {
  colorVar: string;
  className: string;
  motion: StatusMotion;
  label: string;
  /**
   * Glanceable shape. Every state is a filled disc except `awaiting`, which is
   * a ring so it stays distinct from the amber `auth_required` disc when the
   * pulse is suspended (DESIGN.md status-dot `shape` / `rule`).
   */
  shape: "disc" | "ring";
}

/** The Tailwind class for a state's liveness, or `undefined` when static. */
export function statusMotionClass(motion: StatusMotion): string | undefined {
  if (motion === "breathe") {
    return "motion-safe:animate-breathe";
  }
  if (motion === "breatheAwaiting") {
    return "motion-safe:animate-breathe-awaiting";
  }
  return undefined;
}

export function getSessionStateInfo(status: string): SessionStateInfo {
  const normalized = status
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  switch (normalized) {
    case "running":
      return {
        colorVar: "var(--tethys-agent-active)",
        className: "bg-(--tethys-agent-active)",
        motion: "breathe",
        label: "Running",
        shape: "disc",
      };
    case "awaiting_approval":
    case "awaiting":
    case "requires_action":
      return {
        colorVar: "var(--tethys-status-warning)",
        className: "",
        motion: "breatheAwaiting",
        label: "Awaiting approval",
        shape: "ring",
      };
    // Provider / daemon health (DESIGN.md status-dot: healthy, awaiting, error).
    case "healthy":
    case "ready":
      return {
        colorVar: "var(--tethys-status-success)",
        className: "bg-(--tethys-status-success)",
        motion: "none",
        label: "Healthy",
        shape: "disc",
      };
    case "auth_required":
      return {
        colorVar: "var(--tethys-status-warning)",
        className: "bg-(--tethys-status-warning)",
        motion: "none",
        label: "Authentication required",
        shape: "disc",
      };
    case "not_found":
    case "missing":
      return {
        colorVar: "var(--tethys-status-danger)",
        className: "bg-(--tethys-status-danger)",
        motion: "none",
        label: "Not found",
        shape: "disc",
      };
    case "error":
    case "failed":
      return {
        colorVar: "var(--tethys-status-danger)",
        className: "bg-(--tethys-status-danger)",
        motion: "none",
        label: "Error",
        shape: "disc",
      };
    case "interrupted":
      return {
        colorVar: "var(--tethys-text-muted)",
        className: "bg-(--tethys-text-muted)",
        motion: "none",
        label: "Interrupted",
        shape: "disc",
      };
    case "suspended":
      return {
        colorVar: "var(--tethys-hairline-strong)",
        className: "bg-(--tethys-hairline-strong)",
        motion: "none",
        label: "Suspended",
        shape: "disc",
      };
    case "archived":
      return {
        colorVar: "var(--tethys-hairline)",
        className: "bg-(--tethys-hairline)",
        motion: "none",
        label: "Archived",
        shape: "disc",
      };
    default:
      return {
        colorVar: "var(--tethys-agent-idle)",
        className: "bg-(--tethys-agent-idle)",
        motion: "none",
        label: "Idle",
        shape: "disc",
      };
  }
}

/**
 * Rail daemon dot aggregation (spec §1):
 * Aggregate-optimistic: any healthy Provider connection keeps it green, since connections are isolated.
 * 1 healthy + 2 failed Providers -> green (status-success); 0 healthy -> danger (status-danger).
 */
export function getDaemonHealthDotState(
  providers: Array<{ isHealthy: boolean }>,
): {
  colorVar: string;
  className: string;
  isHealthy: boolean;
} {
  if (providers.length === 0) {
    return {
      colorVar: "var(--tethys-status-danger)",
      className: "bg-(--tethys-status-danger)",
      isHealthy: false,
    };
  }

  const anyHealthy = providers.some((p) => p.isHealthy);
  if (anyHealthy) {
    return {
      colorVar: "var(--tethys-status-success)",
      className: "bg-(--tethys-status-success)",
      isHealthy: true,
    };
  }

  return {
    colorVar: "var(--tethys-status-danger)",
    className: "bg-(--tethys-status-danger)",
    isHealthy: false,
  };
}
