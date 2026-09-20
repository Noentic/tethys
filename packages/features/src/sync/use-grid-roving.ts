//! `sync-grid`'s two-dimensional roving focus model (DESIGN.md `Grid roving`).
//!
//! The pure `nextGridFocus` state machine is the test surface; `useGridRoving`
//! is the thin DOM binding that moves focus and scrolls the cell into view past
//! the frozen column and sticky header.

import { useCallback, useEffect, useRef, useState } from "react";

/** One focus position. `col === -1` is the frozen server `rowheader`. */
export interface GridFocus {
  row: number;
  col: number;
}

export interface GridRovingDims {
  rowCount: number;
  columnCount: number;
  /** Rows moved by `PageUp`/`PageDown`; defaults to 10. */
  visibleRows?: number;
}

export function focusKey(focus: GridFocus): string {
  return `${focus.row}:${focus.col}`;
}

function maxCol(columnCount: number): number {
  return columnCount - 1;
}

function clampCol(col: number, columnCount: number): number {
  if (columnCount <= 0) return -1;
  return Math.max(-1, Math.min(col, maxCol(columnCount)));
}

/** Keeps a focus position inside the grid after the axes change. */
export function clampFocus(focus: GridFocus, dims: GridRovingDims): GridFocus {
  if (dims.rowCount <= 0) return { row: 0, col: -1 };
  return {
    row: Math.max(0, Math.min(focus.row, dims.rowCount - 1)),
    col: clampCol(focus.col, dims.columnCount),
  };
}

/** The first focusable gridcell on entry (the rowheader when no columns exist). */
export function initialFocus(dims: GridRovingDims): GridFocus {
  return { row: 0, col: dims.columnCount > 0 ? 0 : -1 };
}

/**
 * Pure 2-D roving state machine. Returns the next focus position, or `null`
 * when the key is not part of the grid model (`Tab` leaves the grid). Arrows
 * clamp at the edge without wrapping; `←` from the first `gridcell` reaches the
 * `rowheader`; `Home`/`End` are the row's ends and `Ctrl+Home`/`Ctrl+End` the
 * grid's corners.
 */
export function nextGridFocus(
  key: string,
  focus: GridFocus,
  dims: GridRovingDims,
): GridFocus | null {
  if (dims.rowCount <= 0) return null;

  const rowCount = dims.rowCount;
  const cols = dims.columnCount;
  const page = dims.visibleRows ?? 10;
  const row = Math.max(0, Math.min(focus.row, rowCount - 1));
  const col = clampCol(focus.col, cols);

  switch (key) {
    case "ArrowRight":
      return { row, col: cols <= 0 ? -1 : Math.min(col + 1, maxCol(cols)) };
    case "ArrowLeft":
      return { row, col: Math.max(col - 1, -1) };
    case "ArrowUp":
      return { row: Math.max(row - 1, 0), col };
    case "ArrowDown":
      return { row: Math.min(row + 1, rowCount - 1), col };
    case "Home":
      return { row, col: cols > 0 ? 0 : -1 };
    case "End":
      return { row, col: cols > 0 ? maxCol(cols) : -1 };
    case "PageUp":
      return { row: Math.max(row - page, 0), col };
    case "PageDown":
      return { row: Math.min(row + page, rowCount - 1), col };
    case "Ctrl+Home":
      return { row: 0, col: cols > 0 ? 0 : -1 };
    case "Ctrl+End":
      return { row: rowCount - 1, col: cols > 0 ? maxCol(cols) : -1 };
    default:
      return null;
  }
}

export interface GridRoving {
  focus: GridFocus;
  /** Attach to the grid container's `onKeyDown`. */
  onKeyDown: (event: React.KeyboardEvent) => void;
  /** Per-cell ref callback, keyed by its `(row, col)`. */
  register: (row: number, col: number) => (el: HTMLElement | null) => void;
  /** Whether this cell is the single `tabindex=0` roving target. */
  isFocused: (row: number, col: number) => boolean;
}

/** Binds the pure model to DOM focus. One `tabindex=0`; `Tab` leaves the grid. */
export function useGridRoving(dims: GridRovingDims): GridRoving {
  const { rowCount, columnCount, visibleRows } = dims;
  const [focus, setFocus] = useState<GridFocus>(() => initialFocus(dims));
  const cells = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    setFocus((prev) => clampFocus(prev, { rowCount, columnCount }));
  }, [rowCount, columnCount]);

  const register = useCallback(
    (row: number, col: number) => (el: HTMLElement | null) => {
      const key = focusKey({ row, col });
      if (el === null) {
        cells.current.delete(key);
      } else {
        cells.current.set(key, el);
      }
    },
    [],
  );

  const move = useCallback((next: GridFocus) => {
    setFocus(next);
    const el = cells.current.get(focusKey(next));
    el?.focus();
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const key =
        event.ctrlKey || event.metaKey ? `Ctrl+${event.key}` : event.key;
      const next = nextGridFocus(key, focus, {
        rowCount,
        columnCount,
        visibleRows,
      });
      if (next === null) return;
      event.preventDefault();
      move(next);
    },
    [focus, rowCount, columnCount, visibleRows, move],
  );

  const isFocused = useCallback(
    (row: number, col: number) => focus.row === row && focus.col === col,
    [focus],
  );

  return { focus, onKeyDown, register, isFocused };
}
