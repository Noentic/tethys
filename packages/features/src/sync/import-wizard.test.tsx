import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ImportScan } from "@tethys/bindings";
import type { McpSyncClient } from "@tethys/state";
import { importScanFixture } from "@tethys/state";
import { describe, expect, it, vi } from "vitest";
import { McpImportWizard } from "./import-wizard";

function fakeClient(scan: ImportScan = importScanFixture) {
  const apply = vi.fn().mockResolvedValue(["context7"]);
  const mcp: McpSyncClient["mcp"] = {
    attachments: vi.fn(),
    registry_list: vi.fn(),
    projection_verify: vi.fn(),
    projection_plan: vi.fn(),
    projection_apply: vi.fn(),
    projection_rollback: vi.fn(),
    import_scan: vi.fn().mockResolvedValue(scan),
    import_apply: apply,
  };
  return { mcp, apply, client: { mcp } as unknown as McpSyncClient };
}

describe("McpImportWizard (M1.11 U6)", () => {
  it("previews candidates and surfaces unscannable failures", async () => {
    const { client } = fakeClient();
    render(
      <McpImportWizard
        open
        client={client}
        workspaceId="w1"
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByLabelText("Include context7")).toBeTruthy();
    expect(screen.getByLabelText("Include linear")).toBeTruthy();
    expect(screen.getByText("unreadable JSON")).toBeTruthy();
  });

  it("marks a conflict and leaves it selectable", async () => {
    const { client } = fakeClient();
    render(
      <McpImportWizard
        open
        client={client}
        workspaceId="w1"
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText("conflict")).toBeTruthy();
    const checkbox = screen.getByLabelText("Include linear");
    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });

  it("applies exactly the selected candidate and the chosen scope", async () => {
    const { client, apply } = fakeClient();
    const onImported = vi.fn();
    render(
      <McpImportWizard
        open
        client={client}
        workspaceId="w1"
        onClose={vi.fn()}
        onImported={onImported}
      />,
    );
    fireEvent.click(await screen.findByLabelText("Include context7"));
    fireEvent.change(screen.getByLabelText("Import scope"), {
      target: { value: "global" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Import/ }));
    await waitFor(() =>
      expect(apply).toHaveBeenCalledWith(
        "w1",
        [importScanFixture.candidates[0]],
        "global",
      ),
    );
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it("renders an honest empty preview", async () => {
    const { client } = fakeClient({ candidates: [], failures: [] });
    render(
      <McpImportWizard
        open
        client={client}
        workspaceId="w1"
        onClose={vi.fn()}
      />,
    );
    expect(
      await screen.findByText("No importable servers found."),
    ).toBeTruthy();
  });
});
