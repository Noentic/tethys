import { describe, expect, it } from "vitest";
import { clampFocus, initialFocus, nextGridFocus } from "./use-grid-roving";

const dims = { rowCount: 3, columnCount: 4, visibleRows: 2 };

describe("nextGridFocus", () => {
  it("moves one cell right and one row down", () => {
    expect(nextGridFocus("ArrowRight", { row: 1, col: 1 }, dims)).toEqual({
      row: 1,
      col: 2,
    });
    expect(nextGridFocus("ArrowDown", { row: 1, col: 1 }, dims)).toEqual({
      row: 2,
      col: 1,
    });
  });

  it("stops at the last column without wrapping", () => {
    expect(nextGridFocus("ArrowRight", { row: 0, col: 3 }, dims)).toEqual({
      row: 0,
      col: 3,
    });
  });

  it("reaches the rowheader with ArrowLeft from the first gridcell", () => {
    expect(nextGridFocus("ArrowLeft", { row: 0, col: 0 }, dims)).toEqual({
      row: 0,
      col: -1,
    });
    expect(nextGridFocus("ArrowLeft", { row: 0, col: -1 }, dims)).toEqual({
      row: 0,
      col: -1,
    });
  });

  it("moves Home/End to the row's cells and Ctrl+Home/End to the corners", () => {
    expect(nextGridFocus("Home", { row: 2, col: 3 }, dims)).toEqual({
      row: 2,
      col: 0,
    });
    expect(nextGridFocus("End", { row: 2, col: 0 }, dims)).toEqual({
      row: 2,
      col: 3,
    });
    expect(nextGridFocus("Ctrl+Home", { row: 2, col: 3 }, dims)).toEqual({
      row: 0,
      col: 0,
    });
    expect(nextGridFocus("Ctrl+End", { row: 0, col: 0 }, dims)).toEqual({
      row: 2,
      col: 3,
    });
  });

  it("moves by the visible row count for PageUp/PageDown and clamps", () => {
    expect(nextGridFocus("PageDown", { row: 0, col: 0 }, dims)).toEqual({
      row: 2,
      col: 0,
    });
    expect(nextGridFocus("PageUp", { row: 2, col: 0 }, dims)).toEqual({
      row: 0,
      col: 0,
    });
  });

  it("ignores Tab so it can leave the grid", () => {
    expect(nextGridFocus("Tab", { row: 0, col: 0 }, dims)).toBeNull();
  });

  it("with no Providers, only the rowheader axis remains", () => {
    const noColumns = { rowCount: 2, columnCount: 0 };
    expect(initialFocus(noColumns)).toEqual({ row: 0, col: -1 });
    expect(nextGridFocus("ArrowRight", { row: 0, col: -1 }, noColumns)).toEqual(
      {
        row: 0,
        col: -1,
      },
    );
    expect(nextGridFocus("ArrowDown", { row: 0, col: -1 }, noColumns)).toEqual({
      row: 1,
      col: -1,
    });
  });

  it("clamps a stale focus position when the axes shrink", () => {
    expect(
      clampFocus({ row: 9, col: 9 }, { rowCount: 2, columnCount: 1 }),
    ).toEqual({ row: 1, col: 0 });
  });
});
