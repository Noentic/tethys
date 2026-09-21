//! Trusted workspace hook (M1.10 selector data; overview D12).
//!
//! Live source is the trust-filtered `workspace.list`, read through
//! `useWorkspacesQuery`. The fixtures below are test doubles only.

import type { Vcs, WorkspaceListItem } from "@tethys/bindings";
import { useWorkspaceOptions } from "./queries";

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

/** Maps a `workspace.list` row onto the composer's workspace option. */
export function toTrustedWorkspace(item: WorkspaceListItem): TrustedWorkspace {
  return {
    id: item.id,
    name: item.name,
    path: item.path,
    vcs: item.capabilities.vcs,
  };
}

/**
 * Trust-filtered workspaces. Pass `workspaces` to override in a test;
 * otherwise the live `workspace.list` query is the source.
 */
export function useTrustedWorkspaces(
  workspaces?: TrustedWorkspace[],
): TrustedWorkspace[] {
  const live = useWorkspaceOptions(undefined, workspaces === undefined);
  return workspaces ?? live;
}
