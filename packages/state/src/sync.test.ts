import { describe, expect, it } from "vitest";
import {
  attachmentGridFixtures,
  countAttachedCells,
  gridDimensions,
  gridRows,
  hasFallbackProjection,
  renderCellState,
} from "./sync";

describe("gridRows", () => {
  it("orders each row's cells by Provider column order", () => {
    const rows = gridRows(attachmentGridFixtures.twoByFour);
    expect(rows).toHaveLength(2);
    expect(rows[0].server.name).toBe("context7");
    expect(rows[0].cells.map((cell) => cell.provider.id)).toEqual([
      "claude-code",
      "opencode",
      "codex",
      "kiro",
    ]);
    expect(rows[1].cells.every((cell) => cell.state.kind === "attached")).toBe(
      true,
    );
  });
});

describe("gridDimensions", () => {
  it("reports an empty row axis but keeps the column count", () => {
    expect(gridDimensions(attachmentGridFixtures.noServers)).toEqual({
      rowCount: 0,
      columnCount: 4,
    });
  });

  it("reports an empty column axis but keeps the row count", () => {
    expect(gridDimensions(attachmentGridFixtures.noProviders)).toEqual({
      rowCount: 2,
      columnCount: 0,
    });
  });

  it("reports both axes empty for the zero fixture", () => {
    expect(gridDimensions(attachmentGridFixtures.empty)).toEqual({
      rowCount: 0,
      columnCount: 0,
    });
  });
});

describe("countAttachedCells", () => {
  it("does not count excluded or fallback cells", () => {
    const grid = attachmentGridFixtures.allStates;
    const total = grid.cells.length;
    const attached = countAttachedCells(grid);
    const excluded = grid.cells.filter(
      (cell) => cell.state.kind === "excluded",
    ).length;
    expect(excluded).toBeGreaterThan(0);
    expect(attached).toBeLessThan(total - excluded);
  });
});

describe("renderCellState", () => {
  it("maps every AttachmentState kind to a non-empty label", () => {
    const kinds = [
      { kind: "attached" },
      { kind: "unsupported-transport", needs: "http" },
      { kind: "file-projection", target: "codex", state: "pending" },
      { kind: "excluded" },
      { kind: "not-negotiated" },
    ] as const;
    for (const state of kinds) {
      expect(renderCellState(state).label.length).toBeGreaterThan(0);
    }
  });

  it("marks a drifted file projection warning and names the sub-state", () => {
    const view = renderCellState({
      kind: "file-projection",
      target: "codex",
      state: "drifted",
    });
    expect(view.tone).toBe("warning");
    expect(view.sub).toBe("drifted");
    expect(view.actionable).toBe(true);
  });

  it("marks a conflict file projection danger", () => {
    expect(
      renderCellState({
        kind: "file-projection",
        target: "codex",
        state: "conflict",
      }).tone,
    ).toBe("danger");
  });

  it("never maps not-negotiated to the Attached label", () => {
    const view = renderCellState({ kind: "not-negotiated" });
    expect(view.label).not.toBe("Attached");
    expect(view.label).toBe("not connected");
  });

  it("reports the transport a cell needs", () => {
    expect(
      renderCellState({ kind: "unsupported-transport", needs: "sse" }).sub,
    ).toBe("needs sse");
  });
});

describe("hasFallbackProjection", () => {
  it("is true only when a cell is on the fallback path", () => {
    expect(hasFallbackProjection(attachmentGridFixtures.allStates)).toBe(true);
    expect(hasFallbackProjection(attachmentGridFixtures.twoByFour)).toBe(false);
    expect(hasFallbackProjection(attachmentGridFixtures.empty)).toBe(false);
  });
});
