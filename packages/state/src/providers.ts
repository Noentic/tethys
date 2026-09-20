//! Single source of Provider truth (M1.12 U7; overview D10/D12).
//!
//! The store holds the generated `AgentProfileView` rows keyed by profile id;
//! UI-only in-flight state lives on the row (`recheck`, `last_checked_ms`) so
//! the backend owns the clock. Selectors are pure functions over state so the
//! swap point for worktrees C and F is mechanical
//! (`useProviderConnections` / `selectProviderConnections`).

import { Store } from "@tanstack/store";
import type { AgentProfileView, ProviderHealth } from "@tethys/bindings";
import { getDaemonHealthDotState } from "@tethys/ui/src/session-state";
import { useSyncExternalStore } from "react";

export interface ProvidersState {
  byId: Record<string, AgentProfileView>;
  /** Stable display order (profile id, sorted). */
  order: string[];
}

export const providersStore = new Store<ProvidersState>({
  byId: {},
  order: [],
});

/** Replaces the store contents from an `agent.profiles_list` result. */
export function ingestProviders(views: AgentProfileView[]): void {
  const byId: Record<string, AgentProfileView> = {};
  for (const view of views) {
    byId[view.id] = view;
  }
  const order = Object.keys(byId).sort();
  providersStore.setState(() => ({ byId, order }));
}

/** Applies one row (create/update/health result) without disturbing others. */
export function upsertProvider(view: AgentProfileView): void {
  providersStore.setState((state) => {
    const byId = { ...state.byId, [view.id]: view };
    const order = Object.keys(byId).sort();
    return { byId, order };
  });
}

/** Marks a Provider's re-check in flight, leaving the last health intact. */
export function markProviderChecking(profileId: string): void {
  providersStore.setState((state) => {
    const existing = state.byId[profileId];
    if (!existing) return state;
    return {
      ...state,
      byId: {
        ...state.byId,
        [profileId]: { ...existing, recheck: "checking" },
      },
    };
  });
}

export function selectAllProviders(state: ProvidersState): AgentProfileView[] {
  return state.order.map((id) => state.byId[id]).filter(Boolean);
}

export function selectProviderById(
  state: ProvidersState,
  profileId: string,
): AgentProfileView | undefined {
  return state.byId[profileId];
}

/** Enabled Providers only, in display order. */
export function selectEnabledProviders(
  state: ProvidersState,
): AgentProfileView[] {
  return selectAllProviders(state).filter((provider) => provider.enabled);
}

/** Health is the only axis the daemon dot aggregates (spec §1). */
export function isProviderHealthy(health: ProviderHealth): boolean {
  return health === "healthy";
}

/**
 * Rail daemon dot: aggregate-optimistic across Provider rows. Delegates to the
 * shared `getDaemonHealthDotState` — the rule lives in `@tethys/ui`, never here
 * (overview D11).
 */
export function selectDaemonHealthy(state: ProvidersState): boolean {
  const providers = selectAllProviders(state).map((provider) => ({
    isHealthy: provider.enabled && isProviderHealthy(provider.health),
  }));
  return getDaemonHealthDotState(providers).isHealthy;
}

/** Subscribe a React component to the provider store. */
export function useProviders(): ProvidersState {
  return useSyncExternalStore(
    (onStoreChange) => {
      const subscription = providersStore.subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    () => providersStore.state,
  );
}

/** The store's Provider list, in display order. */
export function useProviderList(): AgentProfileView[] {
  return selectAllProviders(useProviders());
}

export function clearProvidersForTesting(): void {
  ingestProviders([]);
}
