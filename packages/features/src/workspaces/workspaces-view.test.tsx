import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WorkspaceListItem } from "@tethys/bindings";
import type { CatalogWorkspace } from "@tethys/state";
import {
  clearAllSessionStoresForTesting,
  createInitialSessionState,
  createSessionStore,
  queryClient,
  workspaceCapabilityFixtures,
} from "@tethys/state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type WorkspaceCatalogClient, WorkspacesView } from "./workspaces-view";

function workspace(
  partial: Partial<CatalogWorkspace> & Pick<CatalogWorkspace, "id" | "name">,
): CatalogWorkspace {
  return {
    path: `~/Code/${partial.id}`,
    capabilities: workspaceCapabilityFixtures["git-remote"],
    trust: "trusted",
    permissionMode: "supervised",
    sessions: [],
    ...partial,
  };
}

const awaitingSession = {
  id: "s1",
  providerId: "codex",
  branchName: "feature/JIRA-4821-fix-auth-token-refresh",
  status: "AwaitingApproval" as const,
  turnCount: 3,
  diffStat: { added: 7, removed: 2 },
};

const tethys = workspace({
  id: "tethys",
  name: "tethys",
  sessions: [
    {
      id: "s0",
      providerId: "claude-code",
      branchName: "main",
      status: "Running",
      turnCount: 2,
      diffStat: { added: 1, removed: 1 },
    },
    awaitingSession,
  ],
});
const notes = workspace({
  id: "notes",
  name: "notes",
  capabilities: workspaceCapabilityFixtures["git-local"],
});
const scratch = workspace({
  id: "scratch",
  name: "scratch",
  capabilities: workspaceCapabilityFixtures["no-git"],
});

function emptyClient(): WorkspaceCatalogClient {
  return {
    workspace: {
      list: async () => [],
      add: async () => ({}) as WorkspaceListItem,
      remove: async () => {},
    },
    agent: { profilesList: async () => [] },
    thread: {
      listProviderSessions: async () => ({ sessions: [], next_cursor: null }),
      importSessions: async () => [],
      archive: async () => {},
      delete: async () => {},
      deleteProviderSession: async () => {},
    },
  };
}

/** A real pending request for the `tethys` workspace, in the session store. */
function seedPendingPermission() {
  const initial = createInitialSessionState(
    "s-pending",
    "codex",
    "tethys",
    "Fix auth",
  );
  createSessionStore({
    ...initial,
    status: "awaiting_approval",
    pendingPermissions: [
      {
        reqId: "req-1",
        title: "Edit apps/desktop/src/routes/workspaces.tsx",
        description: null,
        options: [],
      },
    ],
  });
}

describe("workspaces-view", () => {
  beforeEach(() => {
    clearAllSessionStoresForTesting();
    queryClient.clear();
  });

  it("opens the peek drawer with only the two DESIGN tabs", () => {
    render(
      <WorkspacesView workspaces={[tethys, notes]} client={emptyClient()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "tethys" }));
    expect(screen.getByRole("tab", { name: /Sessions/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Approvals/ })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /Policy/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Trust/ })).toBeNull();
  });

  it("deep-links a card with pending approvals to the Approvals tab", () => {
    seedPendingPermission();
    render(<WorkspacesView workspaces={[tethys]} client={emptyClient()} />);
    fireEvent.click(screen.getByRole("button", { name: "tethys" }));
    expect(screen.getByTestId("drawer-approval-entry")).toBeTruthy();
  });

  it("marks a pending approval in the drawer with a left rule, not a perimeter", () => {
    seedPendingPermission();
    render(<WorkspacesView workspaces={[tethys]} client={emptyClient()} />);
    fireEvent.click(screen.getByRole("button", { name: "tethys" }));
    const entry = screen.getByTestId("drawer-approval-entry");
    expect(entry.className).toContain("border-l-(--tethys-status-warning)");
    expect(entry.className).not.toContain("border-warning-soft");
  });

  it("filters the grid to pending-approval cards", () => {
    render(
      <WorkspacesView
        workspaces={[tethys, notes, scratch]}
        client={emptyClient()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Needs attention/ }));
    expect(screen.getByRole("button", { name: "tethys" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "notes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "scratch" })).toBeNull();
  });

  it("disables the drawer's new thread when the one-session cap is reached", () => {
    const capped = workspace({
      id: "scratch",
      name: "scratch",
      capabilities: workspaceCapabilityFixtures["no-git"],
      sessions: [
        {
          id: "s1",
          providerId: "claude-code",
          branchName: "main",
          status: "Running",
          turnCount: 1,
          diffStat: null,
        },
      ],
    });
    render(<WorkspacesView workspaces={[capped]} client={emptyClient()} />);
    fireEvent.click(screen.getByRole("button", { name: "scratch" }));
    expect(
      screen
        .getByRole("button", { name: "New thread" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("adds a workspace through the trust dialog", async () => {
    const added: WorkspaceListItem = {
      id: "/tmp/new",
      name: "new",
      path: "/tmp/new",
      capabilities: workspaceCapabilityFixtures["git-local"],
      trust: "trusted",
      sessions: [],
    };
    const add = vi.fn(async () => added);
    const client: WorkspaceCatalogClient = {
      workspace: { list: async () => [], add, remove: async () => {} },
      agent: { profilesList: async () => [] },
      thread: {
        listProviderSessions: async () => ({ sessions: [], next_cursor: null }),
        importSessions: async () => [],
        archive: async () => {},
        delete: async () => {},
        deleteProviderSession: async () => {},
      },
    };
    render(
      <WorkspacesView
        workspaces={[]}
        client={client}
        pickFolder={async () => "/tmp/new"}
        inspectPath={async () => ({ kind: "git-local" })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add workspace/ }));
    await waitFor(() => {
      expect(screen.getByTestId("trust-copy-local-git")).toBeTruthy();
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Trust & Add Workspace/ }),
    );
    await waitFor(() => {
      expect(add).toHaveBeenCalledWith({
        path: "/tmp/new",
        permission_mode: "supervised",
        scope: "folder",
        init_git: false,
      });
      expect(screen.getByRole("button", { name: "new" })).toBeTruthy();
    });
  });

  it("opens the trust dialog with the no-VCS copy when the probe rejects", async () => {
    render(
      <WorkspacesView
        workspaces={[]}
        client={emptyClient()}
        pickFolder={async () => "/tmp/unknown"}
        inspectPath={async () => {
          throw new Error("probe failed");
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add workspace/ }));
    await waitFor(() => {
      expect(screen.getByTestId("trust-copy-none")).toBeTruthy();
    });
  });

  it("does nothing when the folder picker is cancelled", async () => {
    const add = vi.fn();
    render(
      <WorkspacesView
        workspaces={[]}
        client={{
          workspace: { list: async () => [], add, remove: async () => {} },
          agent: { profilesList: async () => [] },
          thread: {
            listProviderSessions: async () => ({
              sessions: [],
              next_cursor: null,
            }),
            importSessions: async () => [],
            archive: async () => {},
            delete: async () => {},
            deleteProviderSession: async () => {},
          },
        }}
        pickFolder={async () => null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add workspace/ }));
    await waitFor(() => {
      expect(screen.queryByTestId("trust-copy-none")).toBeNull();
    });
    expect(add).not.toHaveBeenCalled();
  });

  it("imports sessions only from providers that advertise session listing", async () => {
    const profile = {
      id: "codex-profile",
      name: "Codex",
      enabled: true,
      health: "healthy",
      capabilities: { list_sessions: true },
    } as unknown as import("@tethys/bindings").AgentProfileView;
    const importSessions = vi.fn(async () => []);
    const client: WorkspaceCatalogClient = {
      workspace: {
        list: async () => [],
        add: async () => ({}) as WorkspaceListItem,
        remove: async () => {},
      },
      agent: { profilesList: async () => [profile] },
      thread: {
        listProviderSessions: async () => ({ sessions: [], next_cursor: null }),
        importSessions,
        archive: async () => {},
        delete: async () => {},
        deleteProviderSession: async () => {},
      },
    };
    render(<WorkspacesView workspaces={[notes]} client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "notes" }));
    const button = await screen.findByRole("button", { name: "Import Codex" });
    fireEvent.click(button);
    await waitFor(() => {
      expect(importSessions).toHaveBeenCalledWith("codex-profile", "notes");
    });
  });

  it("browses provider sessions page by page", async () => {
    const profile = {
      id: "codex-profile",
      name: "Codex",
      enabled: true,
      health: "healthy",
      capabilities: { list_sessions: true },
    } as unknown as import("@tethys/bindings").AgentProfileView;
    const listProviderSessions = vi.fn(
      async (_profileId: string, _workspaceId: string, cursor?: string) =>
        cursor
          ? {
              sessions: [
                {
                  id: "provider-2",
                  title: null,
                  cwd: "/tmp/notes/two",
                  updated_at: null,
                },
              ],
              next_cursor: null,
            }
          : {
              sessions: [
                {
                  id: "provider-1",
                  title: "First session",
                  cwd: "/tmp/notes/one",
                  updated_at: null,
                },
              ],
              next_cursor: "page-2",
            },
    );
    const client = emptyClient();
    client.agent.profilesList = async () => [profile];
    client.thread.listProviderSessions = listProviderSessions;

    render(<WorkspacesView workspaces={[notes]} client={client} />);
    fireEvent.click(screen.getByRole("button", { name: "notes" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Browse Codex" }),
    );
    expect(await screen.findByText("First session")).toBeTruthy();
    expect(screen.getByText("/tmp/notes/one")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("provider-2")).toBeTruthy();
    expect(listProviderSessions).toHaveBeenNthCalledWith(
      2,
      "codex-profile",
      "notes",
      "page-2",
    );
  });

  it("exposes archive, local delete, and capability-gated provider delete", async () => {
    const profile = {
      id: "codex-profile",
      name: "Codex",
      enabled: true,
      health: "healthy",
      registry_ref: { id: "codex", version: "1.0.0", distribution: "npx" },
      capabilities: { delete_session: true },
    } as unknown as import("@tethys/bindings").AgentProfileView;
    const session = { ...awaitingSession, profileId: "codex-profile" };
    const archive = vi.fn(async () => {});
    const deleteLocal = vi.fn(async () => {});
    const deleteProviderSession = vi.fn(async () => {});
    const client: WorkspaceCatalogClient = {
      workspace: {
        list: async () => [],
        add: async () => ({}) as WorkspaceListItem,
        remove: async () => {},
      },
      agent: { profilesList: async () => [profile] },
      thread: {
        listProviderSessions: async () => ({ sessions: [], next_cursor: null }),
        importSessions: async () => [],
        archive,
        delete: deleteLocal,
        deleteProviderSession,
      },
    };
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <WorkspacesView
        workspaces={[
          workspace({ id: "notes", name: "notes", sessions: [session] }),
        ]}
        client={client}
      />,
    );
    const rowActions = "Actions for feature/JIRA-4821-fix-auth-token-refresh";
    fireEvent.click(screen.getByRole("button", { name: "notes" }));
    fireEvent.click(screen.getByRole("tab", { name: "Sessions" }));
    fireEvent.click(screen.getByLabelText(rowActions));
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    await waitFor(() => expect(archive).toHaveBeenCalledWith("s1"));

    fireEvent.click(screen.getByLabelText(rowActions));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete locally…" }));
    await waitFor(() => expect(deleteLocal).toHaveBeenCalledWith("s1"));

    fireEvent.click(screen.getByLabelText(rowActions));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Delete from provider…" }),
    );
    await waitFor(() =>
      expect(deleteProviderSession).toHaveBeenCalledWith("s1"),
    );
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });
});
