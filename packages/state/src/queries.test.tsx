//! Query-hook contract: the hooks read the client, drop fixture defaults, and
//! degrade to empty rows when the client rejects.

import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { AgentProfileView, WorkspaceListItem } from "@tethys/bindings";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectProviderConnections } from "./provider-connections";
import { clearProvidersForTesting } from "./providers";
import {
  queryClient,
  queryKeys,
  useProvidersQuery,
  useSessionCapabilities,
  useThreadsQuery,
  useWorkspaceCapabilities,
  useWorkspaceRows,
  useWorkspacesQuery,
} from "./queries";
import {
  clearAllSessionStoresForTesting,
  getOrCreateSessionStore,
  getSessionStore,
} from "./stores";
import { workspaceCapabilityFixtures } from "./workspace-capabilities";

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// The hooks read the module client, so the test knobs live on it too.
queryClient.setDefaultOptions({
  queries: { ...queryClient.getDefaultOptions().queries, retry: false },
});

const row: WorkspaceListItem = {
  id: "acme-web",
  name: "acme-web",
  path: "/home/dev/acme-web",
  capabilities: workspaceCapabilityFixtures["git-remote"],
  trust: "trusted",
  sessions: [{ id: "s1", title: "feature/x", state: "Running" }],
};

afterEach(() => {
  queryClient.clear();
  clearProvidersForTesting();
  clearAllSessionStoresForTesting();
});

describe("workspace queries", () => {
  it("maps workspace.list rows into the catalog, sessions included", async () => {
    const client = { workspace: { list: async () => [row] } };
    const { result } = renderHook(() => useWorkspaceRows(client), {
      wrapper,
    });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toMatchObject({
      id: "acme-web",
      name: "acme-web",
    });
    expect(result.current[0].sessions[0]).toMatchObject({
      id: "s1",
      branchName: "feature/x",
      status: "Running",
    });
  });

  it("returns [] for an empty list and no fixture rows leak", async () => {
    const client = { workspace: { list: async () => [] } };
    const { result } = renderHook(() => useWorkspaceRows(client), { wrapper });
    await waitFor(() => expect(result.current).toEqual([]));
  });

  it("exposes the error and renders [] rather than throwing", async () => {
    const client = {
      workspace: {
        list: async () => {
          throw new Error("daemon down");
        },
      },
    };
    const { result } = renderHook(() => useWorkspacesQuery(client), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();

    const rows = renderHook(() => useWorkspaceRows(client), { wrapper });
    await waitFor(() => expect(rows.result.current).toEqual([]));
  });

  it("stays disabled when a caller injects rows", async () => {
    const list = vi.fn(async () => [row]);
    const client = { workspace: { list } };
    renderHook(() => useWorkspacesQuery(client, false), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(list).not.toHaveBeenCalled();
  });
});

describe("provider query", () => {
  it("ingests profiles so the store is the one source", async () => {
    const profile = {
      id: "claude-code",
      name: "Claude Code",
      enabled: true,
      health: "healthy",
      protocol: "V2",
      auth_methods: [],
    } as unknown as AgentProfileView;
    const client = { agent: { profilesList: async () => [profile] } };
    const { result } = renderHook(() => useProvidersQuery(client), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    await waitFor(() =>
      expect(selectProviderConnections().map((row) => row.id)).toEqual([
        "claude-code",
      ]),
    );
  });
});

describe("thread query", () => {
  it("hydrates the sessions registry from thread.list", async () => {
    const client = {
      thread: {
        list: async () => [
          {
            id: "t1",
            workspace_id: "acme-web",
            agent_profile_id: "claude-code",
            title: "Fix the header",
            workdir: "/home/dev/acme-web",
            state: "AwaitingApproval" as const,
            session_id: null,
          },
        ],
      },
    };
    const { result } = renderHook(() => useThreadsQuery(client), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    await waitFor(() =>
      expect(getSessionStore("t1")?.state).toMatchObject({
        workspaceId: "acme-web",
        status: "awaiting_approval",
        title: "Fix the header",
      }),
    );
  });
});

describe("capability queries", () => {
  it("reads capabilities from the live workspace row", () => {
    queryClient.setQueryData(queryKeys.workspaces, [row]);
    const { result } = renderHook(() => useWorkspaceCapabilities("acme-web"), {
      wrapper,
    });
    expect(result.current).toEqual(workspaceCapabilityFixtures["git-remote"]);
    expect(result.current?.restore).toBe(true);
  });

  it("omits capabilities for a workspace the list does not hold", () => {
    queryClient.setQueryData(queryKeys.workspaces, [row]);
    const { result } = renderHook(
      () => useWorkspaceCapabilities("somewhere-else"),
      { wrapper },
    );
    expect(result.current).toBeNull();
  });

  it("prefers an explicit fixture over the live row", () => {
    queryClient.setQueryData(queryKeys.workspaces, [row]);
    const { result } = renderHook(
      () => useWorkspaceCapabilities("acme-web", "no-git"),
      { wrapper },
    );
    expect(result.current).toEqual(workspaceCapabilityFixtures["no-git"]);
  });

  it("resolves the workspace a session runs in", () => {
    getOrCreateSessionStore("t1", "codex", "acme-web", "Fix auth");
    queryClient.setQueryData(queryKeys.workspaces, [row]);
    const { result } = renderHook(() => useSessionCapabilities("t1"), {
      wrapper,
    });
    expect(result.current).toEqual(workspaceCapabilityFixtures["git-remote"]);
  });
});
