import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AttachmentGrid } from "@tethys/bindings";
import type { McpSyncClient, WorkspaceOption } from "@tethys/state";
import {
  attachmentGridFixtures,
  projectionPlanFixture,
  registryEntryFixtures,
  workspaceOptionFixtures,
} from "@tethys/state";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { McpView } from "./mcp-view";

function fakeClient(grid: AttachmentGrid = attachmentGridFixtures.twoByFour) {
  const attachments = vi.fn().mockResolvedValue(grid);
  const projection_plan = vi.fn().mockResolvedValue(projectionPlanFixture);
  const registry_set = vi.fn().mockResolvedValue(undefined);
  const mcp: McpSyncClient["mcp"] = {
    attachments,
    registry_list: vi.fn().mockResolvedValue(registryEntryFixtures),
    projection_verify: vi.fn().mockResolvedValue("missing"),
    projection_plan,
    projection_apply: vi.fn(),
    projection_rollback: vi.fn(),
    import_scan: vi.fn().mockResolvedValue({ candidates: [], failures: [] }),
    import_apply: vi.fn(),
    registry_set,
  };
  return {
    attachments,
    projection_plan,
    registry_set,
    client: { mcp } as unknown as McpSyncClient,
  };
}

function Controlled({ client }: { client: McpSyncClient }) {
  const [workspaceId, setWorkspaceId] = useState(workspaceOptionFixtures[0].id);
  const workspaces: WorkspaceOption[] = workspaceOptionFixtures;
  return (
    <McpView
      client={client}
      scope={{ workspaceId, workspaces, selectWorkspace: setWorkspaceId }}
    />
  );
}

describe("McpView (M1.11 U2)", () => {
  it("fetches the grid for the initial workspace and opens the server card", async () => {
    const { client, attachments } = fakeClient();
    render(
      <McpView
        client={client}
        scope={{
          workspaceId: "tethys",
          workspaces: workspaceOptionFixtures,
          selectWorkspace: vi.fn(),
        }}
      />,
    );
    await waitFor(() => expect(attachments).toHaveBeenCalledWith("tethys"));
    await waitFor(() => expect(screen.getByRole("grid")).toBeTruthy());
    fireEvent.click(screen.getAllByRole("rowheader")[0]);
    expect(await screen.findByTestId("server-config-card")).toBeTruthy();
  });

  it("refetches with the new workspace id when the scope changes", async () => {
    const { client, attachments } = fakeClient();
    render(<Controlled client={client} />);
    await waitFor(() => expect(attachments).toHaveBeenCalledWith("tethys"));
    fireEvent.change(screen.getByLabelText("Workspace"), {
      target: { value: "sandbox" },
    });
    await waitFor(() => expect(attachments).toHaveBeenCalledWith("sandbox"));
  });
});

describe("McpView provider surface (pen JfRw1)", () => {
  it("lists the grid's Providers as tabs and reads the target Provider's config file", async () => {
    const { client, projection_plan } = fakeClient();
    render(
      <McpView
        client={client}
        scope={{
          workspaceId: "tethys",
          workspaces: workspaceOptionFixtures,
          selectWorkspace: vi.fn(),
        }}
      />,
    );
    const tabs = await screen.findByRole("tablist", { name: "Provider" });
    expect(tabs.textContent).toContain("Claude Code");
    expect(tabs.textContent).toContain("Codex CLI");

    fireEvent.click(screen.getByRole("tab", { name: /Codex CLI/ }));
    await waitFor(() =>
      expect(projection_plan).toHaveBeenCalledWith(
        "tethys",
        "codex",
        "workspace",
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("mcp-config-file").textContent).toContain(
        projectionPlanFixture.path,
      ),
    );
    expect(screen.getByTestId("mcp-editor-well").textContent).toContain(
      projectionPlanFixture.content,
    );
    expect(
      screen.getByText(/Attached to new Codex CLI sessions at session start/),
    ).toBeTruthy();
  });

  it("names the ACP path for a Provider with no vendor config file", async () => {
    const { client, projection_plan } = fakeClient();
    render(
      <McpView
        client={client}
        scope={{
          workspaceId: "tethys",
          workspaces: workspaceOptionFixtures,
          selectWorkspace: vi.fn(),
        }}
      />,
    );
    await screen.findByRole("tablist", { name: "Provider" });
    expect(screen.getByTestId("mcp-config-file").textContent).toContain(
      "No vendor file",
    );
    expect(projection_plan).not.toHaveBeenCalled();
  });

  it("writes an added server through registry_set and re-reads the list", async () => {
    const { client, registry_set } = fakeClient();
    render(
      <McpView
        client={client}
        scope={{
          workspaceId: "tethys",
          workspaces: workspaceOptionFixtures,
          selectWorkspace: vi.fn(),
        }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Add server" }));
    fireEvent.change(await screen.findByLabelText("Server name"), {
      target: { value: "context7" },
    });
    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "npx -y @modelcontextprotocol/server-everything" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
    fireEvent.change(screen.getByLabelText("Environment name 1"), {
      target: { value: "MCP_API_KEY" },
    });
    fireEvent.change(screen.getByLabelText("Environment value 1"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(registry_set).toHaveBeenCalledWith(
        "context7",
        {
          type: "stdio",
          command: "npx -y @modelcontextprotocol/server-everything",
          env: { MCP_API_KEY: "secret" },
        },
        "workspace",
        "tethys",
      ),
    );
  });
});
