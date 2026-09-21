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
  WorkspaceListItem,
} from "@tethys/bindings";
import { createClient } from "@tethys/client";
import { useEffect, useMemo } from "react";
import { ingestProviders } from "./providers";
import { getOrCreateSessionStore } from "./stores";
import { threadStateToStatusKey } from "./thread-state";
import {
  type TrustedWorkspace,
  toTrustedWorkspace,
} from "./trusted-workspaces";
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
