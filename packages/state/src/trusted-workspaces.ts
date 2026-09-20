//! Trusted workspace hook (M1.10 selector data; overview D12).
//!
//! **Swap point (Wave 2 checkpoint):** worktree F's trust-filtered
//! `workspace.list` (still `call<void>()` today). This module returns a typed
//! fixture until then; the hook signature does not change.

import type { Vcs } from "@tethys/bindings";

/** One workspace the trust store admits for starting a thread. */
export interface TrustedWorkspace {
  id: string;
  name: string;
  /** Absolute root; the resolved `cwd` for `thread.create`. */
  path: string;
  vcs: Vcs;
}

export const trustedWorkspaceFixtures: TrustedWorkspace[] = [
  {
    id: "tethys",
    name: "tethys",
    path: "~/Code/tethys",
    vcs: { kind: "git-remote", host: "github" },
  },
  {
    id: "notes",
    name: "notes",
    path: "~/Documents/notes",
    vcs: { kind: "git-local" },
  },
  {
    id: "scratch",
    name: "scratch",
    path: "~/scratch",
    vcs: { kind: "none" },
  },
];

/** Fixture with no trusted workspace (the unresolved-pill empty state). */
export const noWorkspaceFixtures: TrustedWorkspace[] = [];

/**
 * Trust-filtered workspaces. Pass `workspaces` to override the fixture in a
 * test; production reads worktree F's trust-filtered `workspace.list`.
 */
export function useTrustedWorkspaces(
  workspaces: TrustedWorkspace[] = trustedWorkspaceFixtures,
): TrustedWorkspace[] {
  return workspaces;
}
