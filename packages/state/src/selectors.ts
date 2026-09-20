import type {
  CancellationState,
  PermissionRequestItem,
  SessionEntry,
  SessionState,
} from "./reducers";

export function selectSessionEntries(state: SessionState): SessionEntry[] {
  return state.entries;
}

export function selectSessionStatus(state: SessionState): string {
  return state.status;
}

export function selectCancellationState(
  state: SessionState,
): CancellationState {
  return state.cancellationState;
}

/** Absolute grace deadline while `cancel_requested`; null in every other phase. */
export function selectGraceDeadline(state: SessionState): string | null {
  return state.graceDeadline;
}

/**
 * Stop button destructiveness (D5 / U3 / U7):
 * Neutral in idle and cancel_requested (protocol cancel sent);
 * Destructive only once grace_elapsed or terminating (process ladder armed).
 */
export function selectIsStopDestructive(
  cancellation: CancellationState,
): boolean {
  return cancellation === "grace_elapsed" || cancellation === "terminating";
}

export function selectPendingPermissions(
  state: SessionState,
): PermissionRequestItem[] {
  return state.pendingPermissions;
}

export interface ProviderSessionGroup {
  providerId: string;
  sessions: SessionState[];
}

export interface WorkspaceSessionGroup {
  workspaceId: string;
  providers: ProviderSessionGroup[];
}

/**
 * Three-level structural grouping (spec §0 / D3 / D5):
 * Workspace -> Provider -> Session
 * Adding a third Provider's session does not reorder the earlier two providers.
 */
export function selectWorkspaceProviderSessionGroups(
  sessions: SessionState[],
): WorkspaceSessionGroup[] {
  const workspaceMap = new Map<string, Map<string, SessionState[]>>();
  const workspaceOrder: string[] = [];
  const providerOrderMap = new Map<string, string[]>();

  for (const session of sessions) {
    const wsId = session.workspaceId;
    const pId = session.providerId;

    if (!workspaceMap.has(wsId)) {
      workspaceMap.set(wsId, new Map());
      workspaceOrder.push(wsId);
      providerOrderMap.set(wsId, []);
    }

    const providerMap = workspaceMap.get(wsId);
    if (!providerMap) continue;

    if (!providerMap.has(pId)) {
      providerMap.set(pId, []);
      const pOrder = providerOrderMap.get(wsId);
      if (pOrder) pOrder.push(pId);
    }

    const list = providerMap.get(pId);
    if (list) list.push(session);
  }

  const result: WorkspaceSessionGroup[] = [];

  for (const wsId of workspaceOrder) {
    const providerMap = workspaceMap.get(wsId);
    const pOrder = providerOrderMap.get(wsId) ?? [];
    const providerGroups: ProviderSessionGroup[] = [];

    for (const pId of pOrder) {
      const sessList = providerMap?.get(pId) ?? [];
      providerGroups.push({
        providerId: pId,
        sessions: sessList,
      });
    }

    result.push({
      workspaceId: wsId,
      providers: providerGroups,
    });
  }

  return result;
}
