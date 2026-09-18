export type SessionStatus =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "error"
  | "interrupted"
  | "suspended"
  | "archived";

export interface SessionStateInfo {
  colorVar: string;
  className: string;
  pulse: boolean;
  label: string;
}

export function getSessionStateInfo(status: string): SessionStateInfo {
  const normalized = status.toLowerCase().replace(/[\s-]+/g, "_");

  switch (normalized) {
    case "running":
      return {
        colorVar: "var(--tethys-agent-active)",
        className: "bg-[var(--tethys-agent-active)] motion-safe:animate-pulse",
        pulse: true,
        label: "Running",
      };
    case "awaiting_approval":
    case "awaiting":
    case "requires_action":
      return {
        colorVar: "var(--tethys-status-warning)",
        className:
          "bg-[var(--tethys-status-warning)] motion-safe:animate-pulse",
        pulse: true,
        label: "Awaiting approval",
      };
    case "error":
    case "failed":
      return {
        colorVar: "var(--tethys-status-danger)",
        className: "bg-[var(--tethys-status-danger)]",
        pulse: false,
        label: "Error",
      };
    case "interrupted":
      return {
        colorVar: "var(--tethys-text-muted)",
        className: "bg-[var(--tethys-text-muted)]",
        pulse: false,
        label: "Interrupted",
      };
    case "suspended":
      return {
        colorVar: "var(--tethys-hairline-strong)",
        className: "bg-[var(--tethys-hairline-strong)]",
        pulse: false,
        label: "Suspended",
      };
    case "archived":
      return {
        colorVar: "var(--tethys-hairline)",
        className: "bg-[var(--tethys-hairline)]",
        pulse: false,
        label: "Archived",
      };
    default:
      return {
        colorVar: "var(--tethys-agent-idle)",
        className: "bg-[var(--tethys-agent-idle)]",
        pulse: false,
        label: "Idle",
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
      className: "bg-[var(--tethys-status-danger)]",
      isHealthy: false,
    };
  }

  const anyHealthy = providers.some((p) => p.isHealthy);
  if (anyHealthy) {
    return {
      colorVar: "var(--tethys-status-success)",
      className: "bg-[var(--tethys-status-success)]",
      isHealthy: true,
    };
  }

  return {
    colorVar: "var(--tethys-status-danger)",
    className: "bg-[var(--tethys-status-danger)]",
    isHealthy: false,
  };
}
