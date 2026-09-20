import type { ThreadState } from "@tethys/bindings";

/**
 * Maps the generated `ThreadState` (PascalCase on the wire) to the status key
 * `StatusDot` / `getSessionStateInfo` switch on. Typed as a
 * `Record<ThreadState, …>`, so a schema rename is a compile error rather than
 * a silent idle dot (`@tethys/ui` deliberately does not depend on bindings).
 */
export const threadStateToStatusKey: Record<ThreadState, string> = {
  Idle: "idle",
  Running: "running",
  AwaitingApproval: "awaiting_approval",
  Error: "error",
  Interrupted: "interrupted",
  Suspended: "suspended",
  Archived: "archived",
};
