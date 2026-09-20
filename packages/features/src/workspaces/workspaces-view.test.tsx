import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WorkspaceListItem } from "@tethys/bindings";
import type { CatalogWorkspace } from "@tethys/state";
import { workspaceCapabilityFixtures } from "@tethys/state";
import { describe, expect, it, vi } from "vitest";
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
  };
}

describe("workspaces-view", () => {
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
    render(<WorkspacesView workspaces={[tethys]} client={emptyClient()} />);
    fireEvent.click(screen.getByRole("button", { name: "tethys" }));
    expect(screen.getByTestId("drawer-approval-entry")).toBeTruthy();
  });

  it("filters the grid to pending-approval cards", () => {
    render(
      <WorkspacesView
        workspaces={[tethys, notes, scratch]}
        client={emptyClient()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Waiting on you/ }));
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
        .getByRole("button", { name: "+ New Thread" })
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
    };
    render(
      <WorkspacesView
        workspaces={[]}
        client={client}
        pickFolder={async () => "/tmp/new"}
        inspectPath={async () => ({ kind: "git-local" })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /New Workspace/ }));
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
});
