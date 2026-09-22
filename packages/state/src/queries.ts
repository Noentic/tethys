//! Live query hooks (TanStack Query) over the typed client.
//!
//! Screens default to these hooks and keep an optional prop so a test can
//! inject rows. The `QueryClient` is module-level and passed explicitly, so the
//! hooks work inside a provider (`apps/desktop` shares this same instance) and
//! in a bare feature test with no provider at all.

import { QueryClient, useQuery } from "@tanstack/react-query";
import type {
  AgentProfileView,
  ThreadSummary,
  WorkspaceCapabilities,
  WorkspaceListItem,
} from "@tethys/bindings";
import { createClient } from "@tethys/client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ingestProviders } from "./providers";
import { getOrCreateSessionStore, sessionsRegistryStore } from "./stores";
import { threadStateToStatusKey } from "./thread-state";
import {
  type TrustedWorkspace,
  toTrustedWorkspace,
} from "./trusted-workspaces";
import {
  type WorkspaceCapabilityFixture,
  workspaceCapabilityFixtures,
} from "./workspace-capabilities";
import { type CatalogWorkspace, mapListItem } from "./workspaces";

/** Shared cache: `main.tsx` hands this same client to `QueryClientProvider`. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});

export const defaultClient = createClient();

export const queryKeys = {
  workspaces: ["workspaces"] as const,
  providers: ["providers"] as const,
  threads: ["threads"] as const,
};

/** The `workspace.list` slice of the client a screen needs. */
export interface WorkspacesQueryClient {
  workspace: { list(): Promise<WorkspaceListItem[]> };
}

/** The `agent.profiles_list` slice of the client a screen needs. */
export interface ProvidersQueryClient {
  agent: { profilesList(): Promise<AgentProfileView[]> };
}

/** The `thread.list` slice of the client a screen needs. */
export interface ThreadsQueryClient {
  thread: { list(): Promise<ThreadSummary[]> };
}

export function useWorkspacesQuery(
  client: WorkspacesQueryClient = defaultClient,
  enabled = true,
) {
  return useQuery(
    {
      queryKey: queryKeys.workspaces,
      queryFn: () => client.workspace.list(),
      enabled,
    },
    queryClient,
  );
}

/** The catalog rows, or `[]` while loading / after an error. */
export function useWorkspaceRows(
  client: WorkspacesQueryClient = defaultClient,
  enabled = true,
): CatalogWorkspace[] {
  const query = useWorkspacesQuery(client, enabled);
  const rows = query.data;
  return useMemo(() => (rows ?? []).map(mapListItem), [rows]);
}

/** Trust-filtered workspaces for the composer. */
export function useWorkspaceOptions(
  client: WorkspacesQueryClient = defaultClient,
  enabled = true,
): TrustedWorkspace[] {
  const query = useWorkspacesQuery(client, enabled);
  const rows = query.data;
  return useMemo(() => (rows ?? []).map(toTrustedWorkspace), [rows]);
}

/**
 * The workspace a session runs in, or `""` until the thread list lands. Read
 * from the registry so it survives a store being created before its row is
 * known (the Inspector mounts on a bare session id).
 */
export function useSessionWorkspaceId(sessionId: string): string {
  return useSyncExternalStore(
    (onStoreChange) => {
      const subscription = sessionsRegistryStore.subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    () => sessionsRegistryStore.state.sessions[sessionId]?.workspaceId ?? "",
  );
}

/**
 * Capabilities for one workspace row. A `fixture` is the test override; the
 * live `workspace.list` row is the real source, and an unresolved workspace is
 * `null` so a caller omits git-only affordances rather than inventing them.
 */
export function useWorkspaceCapabilities(
  workspaceId: string,
  fixture?: WorkspaceCapabilityFixture,
): WorkspaceCapabilities | null {
  const rows = useWorkspaceRows(undefined, fixture === undefined);
  return useMemo(() => {
    if (fixture !== undefined) return workspaceCapabilityFixtures[fixture];
    return rows.find((row) => row.id === workspaceId)?.capabilities ?? null;
  }, [fixture, rows, workspaceId]);
}

/** Capabilities of the workspace a session runs in. */
export function useSessionCapabilities(
  sessionId: string,
  fixture?: WorkspaceCapabilityFixture,
): WorkspaceCapabilities | null {
  return useWorkspaceCapabilities(useSessionWorkspaceId(sessionId), fixture);
}

/**
 * `agent.profiles_list`, ingested into the provider store so every consumer
 * (`useProviderConnections`, the model selector, the rail dot) sees one truth.
 */
export function useProvidersQuery(
  client: ProvidersQueryClient = defaultClient,
  enabled = true,
) {
  const query = useQuery(
    {
      queryKey: queryKeys.providers,
      queryFn: () => client.agent.profilesList(),
      enabled,
    },
    queryClient,
  );
  const rows = query.data;
  useEffect(() => {
    if (rows) ingestProviders(rows);
  }, [rows]);
  return query;
}

/**
 * `thread.list`, hydrated into the sessions registry so the Sessions drawer and
 * the workspace cards are populated on launch. Identity and state only: the
 * transcript still arrives with the thread screen.
 */
export function useThreadsQuery(
  client: ThreadsQueryClient = defaultClient,
  enabled = true,
) {
  const query = useQuery(
    {
      queryKey: queryKeys.threads,
      queryFn: () => client.thread.list(),
      enabled,
    },
    queryClient,
  );
  const rows = query.data;
  useEffect(() => {
    for (const row of rows ?? []) {
      const store = getOrCreateSessionStore(
        row.id,
        row.agent_profile_id,
        row.workspace_id,
        row.title,
      );
      const status = threadStateToStatusKey[row.state] ?? "idle";
      if (store.state.status !== status) {
        store.setState((prev) => ({ ...prev, status }));
      }
    }
  }, [rows]);
  return query;
}
