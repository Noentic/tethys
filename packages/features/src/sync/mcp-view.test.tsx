import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AttachmentGrid } from "@tethys/bindings";
import type { McpSyncClient, WorkspaceOption } from "@tethys/state";
import {
  attachmentGridFixtures,
  registryEntryFixtures,
  workspaceOptionFixtures,
} from "@tethys/state";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { McpView } from "./mcp-view";

function fakeClient(grid: AttachmentGrid) {
  const attachments = vi.fn().mockResolvedValue(grid);
  const mcp: McpSyncClient["mcp"] = {
    attachments,
    registry_list: vi.fn().mockResolvedValue(registryEntryFixtures),
    projection_verify: vi.fn().mockResolvedValue("missing"),
    projection_plan: vi.fn(),
    projection_apply: vi.fn(),
    projection_rollback: vi.fn(),
    import_scan: vi.fn().mockResolvedValue({ candidates: [], failures: [] }),
    import_apply: vi.fn(),
  };
  return { attachments, client: { mcp } as unknown as McpSyncClient };
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
    const { client, attachments } = fakeClient(
      attachmentGridFixtures.twoByFour,
    );
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
    const { client, attachments } = fakeClient(
      attachmentGridFixtures.twoByFour,
    );
    render(<Controlled client={client} />);
    await waitFor(() => expect(attachments).toHaveBeenCalledWith("tethys"));
    fireEvent.change(screen.getByLabelText("Workspace scope"), {
      target: { value: "sandbox" },
    });
    await waitFor(() => expect(attachments).toHaveBeenCalledWith("sandbox"));
  });
});
