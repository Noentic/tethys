import { fireEvent, render, screen } from "@testing-library/react";
import type { AttachmentGrid } from "@tethys/bindings";
import { attachmentGridFixtures } from "@tethys/state";
import { describe, expect, it } from "vitest";
import { SyncGrid } from "./sync-grid";

function renderGrid(grid: AttachmentGrid) {
  return render(<SyncGrid grid={grid} />);
}

describe("SyncGrid (M1.11 U2)", () => {
  it("exposes grid roles and counts matching the grid", () => {
    renderGrid(attachmentGridFixtures.allStates);
    const grid = screen.getByRole("grid", { name: "MCP server attachments" });
    expect(grid.getAttribute("aria-rowcount")).toBe("3");
    expect(grid.getAttribute("aria-colcount")).toBe("4");
    expect(screen.getAllByRole("columnheader")).toHaveLength(5);
    expect(screen.getAllByRole("rowheader")).toHaveLength(3);
    expect(screen.getAllByRole("gridcell")).toHaveLength(12);
  });

  it("keeps exactly one tabindex=0 and moves it with the arrows", () => {
    renderGrid(attachmentGridFixtures.twoByFour);
    const rovingCells = () =>
      [...screen.getAllByRole("gridcell")].filter(
        (cell) => cell.tabIndex === 0,
      );
    expect(rovingCells()).toHaveLength(1);
    expect(rovingCells()[0].getAttribute("aria-label")).toContain("context7");

    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(rovingCells()).toHaveLength(1);
    expect(rovingCells()[0].getAttribute("aria-label")).toContain("OpenCode");

    fireEvent.keyDown(grid, { key: "ArrowLeft" });
    fireEvent.keyDown(grid, { key: "ArrowLeft" });
    expect(
      screen.getAllByRole("rowheader").filter((h) => h.tabIndex === 0),
    ).toHaveLength(1);
  });

  it("does not wrap past the last column and reaches the corners", () => {
    renderGrid(attachmentGridFixtures.allStates);
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "Ctrl+End" });
    let focused = [...screen.getAllByRole("gridcell")].find(
      (cell) => cell.tabIndex === 0,
    );
    expect(focused?.getAttribute("aria-label")).toContain("sentry");
    expect(focused?.getAttribute("aria-label")).toContain("Kiro");

    fireEvent.keyDown(grid, { key: "ArrowRight" });
    focused = [...screen.getAllByRole("gridcell")].find(
      (cell) => cell.tabIndex === 0,
    );
    expect(focused?.getAttribute("aria-label")).toContain("Kiro");
  });

  it("freezes the server column and header row and reserves scroll padding", () => {
    renderGrid(attachmentGridFixtures.twoByFour);
    const serverHeader = screen.getByRole("columnheader", { name: "Server" });
    expect(getComputedStyle(serverHeader).position).toBe("sticky");
    expect(getComputedStyle(serverHeader).left).toBe("0px");

    const rowHeader = screen.getAllByRole("rowheader")[0];
    expect(getComputedStyle(rowHeader).position).toBe("sticky");
    expect(getComputedStyle(rowHeader).left).toBe("0px");

    const scroll = screen.getByTestId("sync-grid-scroll");
    expect(scroll.style.scrollPaddingLeft).toBe("220px");
    expect(scroll.className).toContain("overflow-x-auto");
  });

  it("renders twelve Provider columns inside the scroll region", () => {
    const providers = Array.from({ length: 12 }, (_value, index) => ({
      id: `p${index}`,
      name: `Provider ${index}`,
      connected: true,
      target: null,
    }));
    const grid: AttachmentGrid = {
      servers: [{ name: "context7", transport: "stdio", scope: "global" }],
      providers,
      cells: providers.map((provider) => ({
        server_name: "context7",
        provider_id: provider.id,
        state: { kind: "attached" } as const,
      })),
    };
    renderGrid(grid);
    expect(screen.getAllByRole("columnheader")).toHaveLength(13);
    expect(screen.getByTestId("sync-grid-scroll").className).toContain(
      "overflow-x-auto",
    );
  });

  it("renders each Provider's status through the shared StatusDot", () => {
    renderGrid(attachmentGridFixtures.twoByFour);
    expect(screen.getAllByRole("status")).toHaveLength(4);
    expect(screen.getAllByLabelText("Healthy")).toHaveLength(3);
    expect(screen.getByLabelText("Not found")).toBeTruthy();
  });

  it("keeps the header and shows No MCP servers configured for zero rows", () => {
    renderGrid(attachmentGridFixtures.noServers);
    expect(screen.getByRole("columnheader", { name: "Server" })).toBeTruthy();
    expect(screen.getByText("No MCP servers configured")).toBeTruthy();
  });

  it("keeps the frozen column and links to Providers for zero columns", () => {
    renderGrid(attachmentGridFixtures.noProviders);
    expect(screen.getAllByRole("rowheader")).toHaveLength(2);
    expect(screen.getByText("No connected Providers")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open Settings / Providers" }),
    ).toBeTruthy();
  });

  it("uses the zero-columns state when both axes are empty", () => {
    renderGrid(attachmentGridFixtures.empty);
    expect(screen.getByText("No connected Providers")).toBeTruthy();
    expect(screen.queryByText("No MCP servers configured")).toBeNull();
  });
});
