import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { AttachmentGrid, ProjectionPlan } from "@tethys/bindings";
import type { McpSyncClient } from "@tethys/state";
import { attachmentGridFixtures, projectionPlanFixture } from "@tethys/state";
import { describe, expect, it, vi } from "vitest";
import { ProjectionFallback } from "./projection-fallback";

const fallbackGrid: AttachmentGrid = {
  servers: [{ name: "context7", transport: "stdio", scope: "workspace" }],
  providers: [
    { id: "codex", name: "Codex CLI", connected: true, target: "codex" },
  ],
  cells: [
    {
      server_name: "context7",
      provider_id: "codex",
      state: { kind: "file-projection", target: "codex", state: "drifted" },
    },
  ],
};

function fakeClient(overrides: Partial<McpSyncClient["mcp"]> = {}) {
  const mcp: McpSyncClient["mcp"] = {
    attachments: vi.fn(),
    registry_list: vi.fn(),
    projection_verify: vi.fn().mockResolvedValue("drifted"),
    projection_plan: vi.fn().mockResolvedValue({
      ...projectionPlanFixture,
      providers: ["claude-code"],
    } satisfies ProjectionPlan),
    projection_apply: vi.fn().mockResolvedValue({
      target: "codex",
      path: projectionPlanFixture.path,
      scope: "workspace",
      file_hash: "b3-new",
      created: false,
    }),
    projection_rollback: vi.fn().mockResolvedValue(undefined),
    import_scan: vi.fn(),
    import_apply: vi.fn(),
    registry_set: vi.fn(),
    ...overrides,
  };
  return { mcp, client: { mcp } as unknown as McpSyncClient };
}

describe("ProjectionFallback (M1.11 U5)", () => {
  it("renders nothing when no cell is on the fallback path", () => {
    const { client } = fakeClient();
    render(
      <ProjectionFallback
        client={client}
        workspaceId="w1"
        grid={attachmentGridFixtures.twoByFour}
      />,
    );
    expect(screen.queryByTestId("projection-fallback")).toBeNull();
  });

  it("previews the diff and names the Providers using the file", async () => {
    const { client } = fakeClient();
    render(
      <ProjectionFallback
        client={client}
        workspaceId="w1"
        grid={fallbackGrid}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview diff" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Providers using this file")).toBeTruthy();
    expect(within(dialog).getByText("claude-code")).toBeTruthy();
    expect(within(dialog).getByTestId("projection-diff").textContent).toContain(
      "@upstash/context7-mcp@latest",
    );
    expect(within(dialog).getByText("context7")).toBeTruthy();
  });

  it("surfaces a server-side conflict as re-plan and retry", async () => {
    const { client } = fakeClient({
      projection_apply: vi
        .fn()
        .mockRejectedValue(new Error("conflict: plan does not match")),
    });
    render(
      <ProjectionFallback
        client={client}
        workspaceId="w1"
        grid={fallbackGrid}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview diff" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("re-plan and retry");
  });

  it("detects drift and rolls back through a destructive confirm", async () => {
    const rollback = vi.fn().mockResolvedValue(undefined);
    const { client } = fakeClient({ projection_rollback: rollback });
    render(
      <ProjectionFallback
        client={client}
        workspaceId="w1"
        grid={fallbackGrid}
      />,
    );
    await waitFor(() => expect(screen.getByText("drifted")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Preview diff" }));
    const previewDialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(previewDialog).getByRole("button", { name: "Apply" }),
    );

    const rollbackButtons = await screen.findAllByRole("button", {
      name: "Rollback",
    });
    fireEvent.click(rollbackButtons[0]);
    const confirm = await screen.findByRole("dialog");
    expect(confirm.textContent).toContain(projectionPlanFixture.path);
    const confirmButton = within(confirm).getByRole("button", {
      name: "Rollback",
    });
    expect(confirmButton.className).toContain("status-danger");
    fireEvent.click(confirmButton);
    await waitFor(() => expect(rollback).toHaveBeenCalledTimes(1));
    expect(rollback).toHaveBeenCalledWith("w1", "codex", "workspace");
  });
});
