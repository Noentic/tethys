import { fireEvent, render, screen } from "@testing-library/react";
import type { AttachmentState } from "@tethys/bindings";
import { describe, expect, it, vi } from "vitest";
import { AttachmentCell } from "./attachment-cell";

function renderCell(state: AttachmentState, onActivate = vi.fn()) {
  render(
    <AttachmentCell
      serverName="context7"
      providerName="Claude Code"
      state={state}
      onActivate={onActivate}
    />,
  );
  return onActivate;
}

describe("AttachmentCell (M1.11 U3)", () => {
  it("renders Attached as a success fact", () => {
    renderCell({ kind: "attached" });
    const cell = screen.getByRole("gridcell");
    expect(cell.textContent).toContain("Attached");
    expect(cell.className).toContain("status-success");
  });

  it("names the needed transport for an unsupported transport", () => {
    renderCell({ kind: "unsupported-transport", needs: "http" });
    const cell = screen.getByRole("gridcell");
    expect(cell.textContent).toContain("Unsupported transport");
    expect(cell.textContent).toContain("needs http");
  });

  it("renders File projection with its sub-state and activates the fallback", () => {
    const onActivate = renderCell({
      kind: "file-projection",
      target: "codex",
      state: "drifted",
    });
    const cell = screen.getByRole("gridcell");
    expect(cell.textContent).toContain("File projection");
    expect(cell.textContent).toContain("drifted");
    expect(cell.className).toContain("status-warning");
    fireEvent.click(cell);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("renders Excluded as an empty dash and never a status word", () => {
    renderCell({ kind: "excluded" });
    const cell = screen.getByRole("gridcell");
    expect(cell.textContent).toBe("—");
  });

  it("renders not connected for NotNegotiated and never Attached", () => {
    renderCell({ kind: "not-negotiated" });
    const cell = screen.getByRole("gridcell");
    expect(cell.textContent).toContain("not connected");
    expect(cell.textContent).not.toContain("Attached");
  });

  it("names server, Provider and state in the aria-label", () => {
    renderCell({ kind: "attached" });
    expect(
      screen.getByRole("gridcell", {
        name: "context7 · Claude Code · Attached",
      }),
    ).toBeTruthy();
  });
});
