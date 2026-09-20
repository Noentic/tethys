import { Store } from "@tanstack/store";
import {
  type CancellationState,
  createInitialSessionState,
  type SessionState,
} from "./reducers";

export type SessionStore = Store<SessionState>;

const sessionStores = new Map<string, SessionStore>();

export interface SessionsRegistryState {
  sessions: Record<string, SessionState>;
  activeSessionId: string | null;
}

export const sessionsRegistryStore = new Store<SessionsRegistryState>({
  sessions: {},
  activeSessionId: null,
});

export function createSessionStore(initialState: SessionState): SessionStore {
  const store = new Store<SessionState>(initialState);
  sessionStores.set(initialState.sessionId, store);

  // Sync to global registry
  sessionsRegistryStore.setState((prev) => ({
    ...prev,
    sessions: {
      ...prev.sessions,
      [initialState.sessionId]: initialState,
    },
    activeSessionId: prev.activeSessionId ?? initialState.sessionId,
  }));

  // Subscribe to keep registry in sync with store
  store.subscribe(() => {
    const current = store.state;
    sessionsRegistryStore.setState((prev) => ({
      ...prev,
      sessions: {
        ...prev.sessions,
        [current.sessionId]: current,
      },
    }));
  });

  return store;
}

export function getSessionStore(sessionId: string): SessionStore | undefined {
  return sessionStores.get(sessionId);
}

export function getOrCreateSessionStore(
  sessionId: string,
  providerId = "default-provider",
  workspaceId = "default-workspace",
  title = "Thread",
  branchName?: string,
): SessionStore {
  const existing = sessionStores.get(sessionId);
  if (existing) {
    return existing;
  }
  const initial = createInitialSessionState(
    sessionId,
    providerId,
    workspaceId,
    title,
    branchName,
  );
  return createSessionStore(initial);
}

export function advanceCancellationState(
  store: SessionStore,
  target: CancellationState,
  graceDeadline: string | null = null,
): void {
  const current = store.state.cancellationState;

  const validTransitions: Record<CancellationState, CancellationState[]> = {
    idle: ["cancel_requested", "idle"],
    cancel_requested: ["grace_elapsed", "idle"],
    grace_elapsed: ["terminating", "idle"],
    terminating: ["idle"],
  };

  const allowed = validTransitions[current];
  if (allowed?.includes(target)) {
    store.setState((prev) => ({
      ...prev,
      cancellationState: target,
      // Only the pending phase carries a deadline; a stale one must not keep
      // the fill animating after the window closed.
      graceDeadline:
        target === "cancel_requested"
          ? (graceDeadline ?? prev.graceDeadline)
          : null,
    }));
  }
}

export function clearAllSessionStoresForTesting(): void {
  sessionStores.clear();
  sessionsRegistryStore.setState(() => ({
    sessions: {},
    activeSessionId: null,
  }));
}
