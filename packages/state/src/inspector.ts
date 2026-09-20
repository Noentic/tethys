//! Inspector/inbox selectors (M1.7/M1.8 U5).
//!
//! The inbox is a pure projection over the existing per-session state — the
//! same `pendingPermissions` / `pendingElicitations` the inline cards read — so
//! there is no second store that can drift.

import type { WorkspaceCapabilities } from "@tethys/bindings";
import type {
  ElicitationRequestItem,
  PermissionRequestItem,
  SessionState,
} from "./reducers";

export type InboxItemKind = "permission" | "elicitation";

export interface InboxItem {
  sessionId: string;
  sessionTitle: string;
  kind: InboxItemKind;
  reqId: string;
  title: string;
  description: string | null;
  permission?: PermissionRequestItem;
  elicitation?: ElicitationRequestItem;
}

/**
 * Flattens every session's pending permissions and elicitations into one
 * session-tagged list — the single inbox truth (D-decision).
 */
export function selectInboxItems(sessions: SessionState[]): InboxItem[] {
  const items: InboxItem[] = [];
  for (const session of sessions) {
    for (const permission of session.pendingPermissions) {
      items.push({
        sessionId: session.sessionId,
        sessionTitle: session.title,
        kind: "permission",
        reqId: permission.reqId,
        title: permission.title,
        description: permission.description,
        permission,
      });
    }
    for (const elicitation of session.pendingElicitations) {
      items.push({
        sessionId: session.sessionId,
        sessionTitle: session.title,
        kind: "elicitation",
        reqId: elicitation.reqId,
        title: elicitation.request.title,
        description: elicitation.request.description,
        elicitation,
      });
    }
  }
  return items;
}

export interface TurnActions {
  /** A per-turn `View diff` entry point renders. */
  viewDiff: boolean;
  /** A per-turn `Restore` entry point renders. */
  restore: boolean;
}

/**
 * Which per-turn affordances a capability set allows. `no-git` yields neither,
 * so a full turn renders with no empty diff section and no layout gap.
 */
export function selectTurnActionsVisible(
  capabilities: WorkspaceCapabilities,
): TurnActions {
  const hasVcs = capabilities.vcs.kind !== "none";
  return {
    viewDiff: hasVcs,
    restore: hasVcs && capabilities.restore,
  };
}
