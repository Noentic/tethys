/**
 * Virtualized diff viewer (M1.9 U4).
 *
 * Renders the U1 row model through `@tanstack/react-virtual` with a constant
 * row height — the shape S0.1 proved at ~30 DOM nodes for 20k lines. Unified
 * and split share one virtualizer; a mode toggle preserves the topmost changed
 * line's anchor identity rather than a pixel offset. Syntax highlight (U3) is a
 * decoration applied after paint, so it never blocks first paint.
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import type { DiffFileDetail } from "@tethys/bindings";
import { SegmentedControl } from "@tethys/ui";
import type React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  HunkHeaderRow,
  rowCells,
  SplitRow,
  UnifiedRow,
  useWordSpans,
} from "./diff-rows";
import {
  createDiffHighlighter,
  type DiffHighlighter,
} from "./highlight/client";
import type { HighlightSpan } from "./highlight/protocol";
import {
  buildDiffRows,
  type DiffCell,
  type DiffRow,
  type DiffViewMode,
  resolveAnchorIndex,
} from "./row-model";

const DEFAULT_ROW_HEIGHT = 24;
const OVERSCAN = 10;
/**
 * Below this width a split view leaves each side too narrow to read, so the
 * viewer stays unified and says why (DESIGN.md `diff-viewer.splitMinWidth`).
 */
export const SPLIT_MIN_WIDTH = 560;
/** Line numbers, gutter glyph, gaps and padding of a unified row, in px. */
const UNIFIED_CHROME_PX = 140;

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(Number.POSITIVE_INFINITY);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (typeof next === "number" && next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export interface DiffViewerProps {
  detail: DiffFileDetail;
  mode?: DiffViewMode;
  onModeChange?: (mode: DiffViewMode) => void;
  onCommentLine?: (line: number) => void;
  /** Called by the `Load file` affordance on a collapsed file. */
  onLoadFile?: () => void;
  /** Discards one hunk (0-based); its `Discard` sits on the hunk's `@@` row. */
  onDiscardHunk?: (hunkIndex: number) => void;
  /** Injected for tests; defaults to the worker-backed highlighter. */
  highlighter?: DiffHighlighter;
  rowHeight?: number;
  className?: string;
}

function isChangedRow(row: DiffRow): boolean {
  if (row.kind === "addition" || row.kind === "deletion") {
    return true;
  }
  // A split `pair` may be two context cells; only a side that changed counts.
  return (
    row.kind === "pair" &&
    (row.left?.kind === "Addition" ||
      row.left?.kind === "Deletion" ||
      row.right?.kind === "Addition" ||
      row.right?.kind === "Deletion")
  );
}

/**
 * The anchor of the topmost fully-visible changed line. Row heights are
 * constant, so the top row is arithmetic; hunk headers and context rows are
 * skipped because their identity does not survive a mode change meaningfully.
 * `viewportHeight` bounds the search so a change below the fold never yanks the
 * viewport; when nothing changed is visible the position is left alone (`null`).
 */
export function topVisibleAnchor(
  rows: DiffRow[],
  scrollTop: number,
  rowHeight: number,
  viewportHeight = Number.POSITIVE_INFINITY,
): string | null {
  if (rows.length === 0) {
    return null;
  }
  const first = Math.min(
    rows.length - 1,
    Math.max(0, Math.floor(scrollTop / rowHeight)),
  );
  const visibleRows = Number.isFinite(viewportHeight)
    ? Math.ceil(viewportHeight / rowHeight)
    : rows.length;
  const last = Math.min(rows.length - 1, first + Math.max(0, visibleRows));
  for (let index = first; index <= last; index += 1) {
    const row = rows[index];
    if (isChangedRow(row)) {
      const anchor = row.anchorIds[0] ?? row.anchorId;
      if (anchor !== null) {
        return anchor;
      }
    }
  }
  return null;
}

export function DiffViewer({
  detail,
  mode: controlledMode,
  onModeChange,
  onCommentLine,
  onLoadFile,
  onDiscardHunk,
  highlighter,
  rowHeight = DEFAULT_ROW_HEIGHT,
  className,
}: DiffViewerProps) {
  const [internalMode, setInternalMode] = useState<DiffViewMode>("unified");
  const sectionRef = useRef<HTMLElement>(null);
  const splitFits = useWidth(sectionRef) >= SPLIT_MIN_WIDTH;
  const mode = splitFits ? (controlledMode ?? internalMode) : "unified";
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingAnchor = useRef<string | null>(null);
  const [highlight, setHighlight] = useState<Map<string, HighlightSpan[]>>(
    () => new Map(),
  );

  const highlighterRef = useRef<DiffHighlighter | null>(null);
  if (highlighterRef.current === null) {
    highlighterRef.current = highlighter ?? createDiffHighlighter();
  }
  const activeHighlighter = highlighter ?? highlighterRef.current;

  const rows = useMemo(() => buildDiffRows(detail, mode), [detail, mode]);
  // A unified row is as wide as the longest line, so its fill and edge bar run
  // the full scroll width instead of stopping at the viewport's edge.
  const longestLine = useMemo(
    () =>
      rows.reduce(
        (longest, row) => Math.max(longest, row.cell?.text.length ?? 0),
        0,
      ),
    [rows],
  );

  const cellIndex = useMemo(() => {
    const index = new Map<string, DiffCell>();
    for (const row of rows) {
      for (const cell of rowCells(row)) {
        index.set(cell.anchorId, cell);
      }
    }
    return index;
  }, [rows]);

  const getWordSpans = useWordSpans(cellIndex);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
    initialRect: { width: 800, height: 400 },
  });
  const virtualItems = virtualizer.getVirtualItems();

  // Decoration after paint: highlight only rows currently in the window, and
  // only re-render when there is something to draw — plain-text results (`[]`)
  // never trigger a state update, so they cannot delay first paint.
  const requestedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const visible = virtualItems
      .map((item) => rows[item.index])
      .filter((row): row is DiffRow => row !== undefined);
    const wanted = new Map<string, DiffCell>();
    for (const row of visible) {
      for (const cell of rowCells(row)) {
        if (!requestedRef.current.has(cell.anchorId)) {
          requestedRef.current.add(cell.anchorId);
          wanted.set(cell.anchorId, cell);
        }
      }
    }
    if (wanted.size === 0) {
      return;
    }
    let cancelled = false;
    void Promise.all(
      [...wanted.values()].map(async (cell) => {
        const lines = await activeHighlighter.highlight(cell.text, detail.path);
        return [cell.anchorId, lines[0] ?? []] as const;
      }),
    ).then((entries) => {
      const decorated = entries.filter(([, spans]) => spans.length > 0);
      if (cancelled || decorated.length === 0) return;
      setHighlight((previous) => new Map([...previous, ...decorated]));
    });
    return () => {
      cancelled = true;
    };
  }, [virtualItems, rows, activeHighlighter, detail.path]);

  const changeMode = (next: DiffViewMode) => {
    if (next === mode) return;
    pendingAnchor.current = topVisibleAnchor(
      rows,
      scrollRef.current?.scrollTop ?? 0,
      rowHeight,
      scrollRef.current?.clientHeight ?? 0,
    );
    if (controlledMode === undefined) {
      setInternalMode(next);
    }
    onModeChange?.(next);
  };

  // Restore the anchor after the new mode's rows have laid out.
  useLayoutEffect(() => {
    const anchor = pendingAnchor.current;
    if (anchor === null) {
      return;
    }
    pendingAnchor.current = null;
    const index = resolveAnchorIndex(rows, anchor);
    if (index === undefined) {
      return;
    }
    try {
      virtualizer.scrollToIndex(index, { align: "start" });
    } catch {
      // jsdom does not implement Element.scrollTo; the direct assignment below
      // still restores the anchor.
    }
    if (scrollRef.current) {
      scrollRef.current.scrollTop = index * rowHeight;
    }
  }, [rows, rowHeight, virtualizer]);

  const collapsed = detail.collapsed || detail.binary;

  return (
    <section
      ref={sectionRef}
      data-testid="diff-viewer"
      data-mode={mode}
      aria-label={`Diff for ${detail.path}`}
      className={`flex min-h-0 flex-col overflow-hidden rounded-md border border-(--tethys-hairline-on-sunken) bg-(--tethys-surface-sunken) font-mono text-mono-code text-(--tethys-text-on-sunken) ${className ?? ""}`}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-(--tethys-hairline) bg-(--tethys-surface-panel) px-2 py-1">
        <span
          title={detail.path}
          className="min-w-0 truncate text-mono-micro text-(--tethys-text-muted)"
        >
          {detail.path}
        </span>
        <SegmentedControl
          size="sm"
          className="shrink-0"
          options={[
            { value: "unified", label: "Unified" },
            {
              value: "split",
              label: (
                <span
                  title={splitFits ? undefined : "Widen the panel to split"}
                >
                  Split
                </span>
              ),
              disabled: !splitFits,
            },
          ]}
          value={mode}
          onChange={(value) => changeMode(value as DiffViewMode)}
        />
      </header>

      {collapsed ? (
        <div
          data-row-kind="collapsed-context"
          className="flex h-8 items-center gap-2 px-3 text-mono-micro text-(--tethys-text-on-sunken-muted)"
        >
          <span>
            {detail.binary
              ? "Binary file — not shown"
              : `${detail.additions + detail.deletions} changed lines — file too large to display`}
          </span>
          {detail.collapsed && onLoadFile && (
            <button
              type="button"
              onClick={onLoadFile}
              className="focus-ring rounded-xs border border-(--tethys-hairline-on-sunken) px-1.5 py-0.5 text-(--tethys-text-on-sunken-secondary) hover:bg-(--tethys-wash-on-sunken)"
            >
              Load file
            </button>
          )}
        </div>
      ) : (
        <div
          ref={scrollRef}
          data-testid="diff-scroll"
          className="min-h-0 flex-1 overflow-auto"
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width:
                mode === "unified"
                  ? `max(100%, calc(${longestLine}ch + ${UNIFIED_CHROME_PX}px))`
                  : "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {row.kind === "hunk-header" && row.header ? (
                    <HunkHeaderRow
                      header={row.header}
                      hunkNumber={(row.hunkIndex ?? 0) + 1}
                      onDiscard={
                        onDiscardHunk && row.hunkIndex !== null
                          ? () => onDiscardHunk(row.hunkIndex as number)
                          : undefined
                      }
                    />
                  ) : mode === "split" ? (
                    <SplitRow
                      row={row}
                      highlight={highlight}
                      getWordSpans={getWordSpans}
                      onCommentLine={onCommentLine}
                    />
                  ) : (
                    <UnifiedRow
                      row={row}
                      highlight={highlight}
                      getWordSpans={getWordSpans}
                      onCommentLine={onCommentLine}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
