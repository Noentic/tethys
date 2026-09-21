import { getOrCreateSessionStore, type SessionState } from "@tethys/state";
import { useSyncExternalStore } from "react";

/**
 * Subscribe to one session's store. The Inspector's header, rollup band and
 * slots all read the same history through this, so a surface never re-derives
 * session state of its own.
 */
export function useSessionState(sessionId: string): SessionState {
  const store = getOrCreateSessionStore(sessionId);
  return useSyncExternalStore(
    (onStoreChange) => {
      const subscription = store.subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    () => store.state,
  );
}
