//! Workspace catalog view state (M1.16 U6).
//!
//! **Swap point (Wave 2 checkpoint):** `useWorkspaceList` reads worktree F's
//! trust-filtered `workspace.list` and `useWorkspaceCapabilities` reads
//! `workspace.capabilities`; both return the canonical fixtures until then.
//! The session surface (branch, turn, diff, provider) is fixture-backed per
//! overview D12; worktrees A/B/E supply the real values at the checkpoint.
//!
//! The chip slot-priority, field-drop, and status-mapping logic are pure
//! functions so the components and their tests share one implementation. The
//! status mapping routes the typed `ThreadState` through
//! [`threadStateToStatusKey`]; no path emits a `waiting_approval` literal.

import type {
  PermissionMode,
  ThreadState,
  Vcs,
  WorkspaceCapabilities,
  WorkspaceTrustState,
} from "@tethys/bindings";
import { threadStateToStatusKey } from "./thread-state";
import {
  type WorkspaceCapabilityFixture,
  workspaceCapabilityFixtures,
} from "./workspace-capabilities";

/** One session as the catalog's chip/row renders it. */
export interface CatalogSession {
  id: string;
  providerId: string;
  branchName: string;
  /** Typed thread state; the view maps it through `sessionStatusKey`. */
  status: ThreadState;
  turnCount: number;
  diffStat: { added: number; removed: number } | null;
}

/** One workspace card in the catalog. */
export interface CatalogWorkspace {
  id: string;
  name: string;
  path: string;
  capabilities: WorkspaceCapabilities;
  trust: WorkspaceTrustState;
  permissionMode: PermissionMode;
  sessions: CatalogSession[];
}

export const catalogWorkspaceFixtures: CatalogWorkspace[] = [
  {
    id: "tethys",
    name: "tethys",
    path: "~/Code/tethys",
    capabilities: workspaceCapabilityFixtures["git-remote"],
    trust: "trusted",
    permissionMode: "supervised",
    sessions: [
      {
        id: "s-m16",
        providerId: "claude-code",
        branchName: "feat/m1.6-design-system-shell",
        status: "Running",
        turnCount: 8,
        diffStat: { added: 34, removed: 12 },
      },
      {
        id: "s-m16b",
        providerId: "codex",
        branchName: "feature/JIRA-4821-fix-auth-token-refresh",
        status: "AwaitingApproval",
        turnCount: 3,
        diffStat: { added: 7, removed: 2 },
      },
    ],
  },
  {
    id: "notes",
    name: "notes",
    path: "~/Documents/notes",
    capabilities: workspaceCapabilityFixtures["git-local"],
    trust: "trusted",
    permissionMode: "supervised",
    sessions: [],
  },
  {
    id: "scratch",
    name: "scratch",
    path: "~/scratch",
    capabilities: workspaceCapabilityFixtures["no-git"],
    trust: "trusted",
    permissionMode: "auto-edit",
    sessions: [],
  },
];

/** Trust-filtered workspaces (fixture default; real source `workspace.list`). */
export function useWorkspaceList(
  workspaces: CatalogWorkspace[] = catalogWorkspaceFixtures,
): CatalogWorkspace[] {
  return workspaces;
}

/** Resolved capabilities (fixture default; real source `workspace.capabilities`). */
export function useWorkspaceCapabilities(
  fixture: WorkspaceCapabilityFixture = "git-remote",
): WorkspaceCapabilities {
  return workspaceCapabilityFixtures[fixture];
}

/** The status key `StatusDot` / `getSessionStateInfo` switch on. */
export type SessionStatusKey =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "error"
  | "interrupted"
  | "suspended"
  | "archived";

export function sessionStatusKey(
  state: ThreadState | string,
): SessionStatusKey {
  if (Object.hasOwn(threadStateToStatusKey, state)) {
    return threadStateToStatusKey[state as ThreadState] as SessionStatusKey;
  }
  return "idle";
}

export function isAwaiting(state: ThreadState | string): boolean {
  return sessionStatusKey(state) === "awaiting_approval";
}

export function isRunning(state: ThreadState | string): boolean {
  return sessionStatusKey(state) === "running";
}

export const CHIP_MIN_WIDTH = 96;
export const CHIP_MAX_WIDTH = 240;
export const CHIP_MAX_VISIBLE = 3;

/** The turn count drops first, then the diff stat; glyph/marker/branch stay. */
export function chipFields(width: number): {
  turn: boolean;
  diffStat: boolean;
} {
  return { turn: width >= 160, diffStat: width >= 120 };
}

/** How many chips fit at `minWidth` (capped at 3); a 320px card fits two. */
export function fitCountForWidth(innerWidth: number, gap = 8): number {
  if (innerWidth <= 0) return 0;
  const per = CHIP_MIN_WIDTH + gap;
  return Math.max(
    0,
    Math.min(CHIP_MAX_VISIBLE, Math.floor((innerWidth + gap) / per)),
  );
}

/** Awaiting first, then running, then the rest in most-recent-first order. */
export function orderSessionsForChips(
  sessions: CatalogSession[],
): CatalogSession[] {
  const rank = (session: CatalogSession) => {
    const key = sessionStatusKey(session.status);
    if (key === "awaiting_approval") return 0;
    if (key === "running") return 1;
    return 2;
  };
  return sessions
    .map((session, index) => ({ session, index }))
    .sort((a, b) => rank(a.session) - rank(b.session) || a.index - b.index)
    .map((entry) => entry.session);
}

export interface ChipSlots {
  visible: CatalogSession[];
  overflow: number;
}

/**
 * Orders sessions and takes what fits. An awaiting session is never in the
 * overflow while a running/idle chip holds a slot, because awaiting sorts first
 * and only the tail is cut.
 */
export function chipSlots(
  sessions: CatalogSession[],
  fitCount: number,
): ChipSlots {
  const ordered = orderSessionsForChips(sessions);
  const cap = Math.max(0, Math.min(CHIP_MAX_VISIBLE, fitCount));
  return {
    visible: ordered.slice(0, cap),
    overflow: Math.max(0, ordered.length - cap),
  };
}

export function workspaceNeedsAttention(workspace: CatalogWorkspace): boolean {
  return workspace.sessions.some((session) => isAwaiting(session.status));
}

export function workspaceHasGit(workspace: CatalogWorkspace): boolean {
  return workspace.capabilities.vcs.kind !== "none";
}

export type CatalogViewMode = "grid" | "list";
export type CatalogSort = "recent" | "name" | "sessions";
export type CatalogPeekTab = "sessions" | "approvals";

export interface CatalogViewState {
  search: string;
  viewMode: CatalogViewMode;
  sort: CatalogSort;
  needsAttentionOnly: boolean;
  selectedId: string | null;
  peekTab: CatalogPeekTab;
}

export const initialCatalogViewState: CatalogViewState = {
  search: "",
  viewMode: "grid",
  sort: "recent",
  needsAttentionOnly: false,
  selectedId: null,
  peekTab: "sessions",
};

/** Filter + sort the catalog from one view state (pure; the view calls it). */
export function selectCatalog(
  workspaces: CatalogWorkspace[],
  view: CatalogViewState,
): CatalogWorkspace[] {
  const query = view.search.trim().toLowerCase();
  const filtered = workspaces.filter((workspace) => {
    if (view.needsAttentionOnly && !workspaceNeedsAttention(workspace)) {
      return false;
    }
    if (query === "") return true;
    return (
      workspace.name.toLowerCase().includes(query) ||
      workspace.path.toLowerCase().includes(query)
    );
  });
  return filtered.sort((a, b) => {
    if (view.sort === "name") return a.name.localeCompare(b.name);
    if (view.sort === "sessions") return b.sessions.length - a.sessions.length;
    return 0;
  });
}

/** The source badge inputs for a workspace's resolved capabilities. */
export function workspaceVcs(workspace: CatalogWorkspace): Vcs {
  return workspace.capabilities.vcs;
}
