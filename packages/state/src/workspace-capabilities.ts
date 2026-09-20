import type { PermissionMode, WorkspaceCapabilities } from "@tethys/bindings";

/**
 * The four canonical capability shapes every capability-driven surface is
 * verified against (`git-remote`, `git-local`, `no-git`, `git-no-restore`).
 * M1.16 re-runs these against the real resolver at the Wave 2 checkpoint.
 */
export type WorkspaceCapabilityFixture =
  | "git-remote"
  | "git-local"
  | "no-git"
  | "git-no-restore";

export const workspaceCapabilityFixtures: Record<
  WorkspaceCapabilityFixture,
  WorkspaceCapabilities
> = {
  "git-remote": {
    vcs: { kind: "git-remote", host: "github" },
    restore: true,
    max_concurrent_sessions: null,
  },
  "git-local": {
    vcs: { kind: "git-local" },
    restore: true,
    max_concurrent_sessions: null,
  },
  "no-git": {
    vcs: { kind: "none" },
    restore: false,
    max_concurrent_sessions: 1,
  },
  "git-no-restore": {
    vcs: { kind: "git-remote", host: "github" },
    restore: false,
    max_concurrent_sessions: null,
  },
};

/**
 * Display labels for the permission-mode pill. Keyed by the schema enum, so a
 * new or renamed variant is a compile error rather than a missing label.
 */
export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  supervised: "Supervised",
  "auto-edit": "Auto-edit",
  yolo: "YOLO",
};
