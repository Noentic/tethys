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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { diffWordSpans, type WordSpan } from "./word-diff";

const DEFAULT_ROW_HEIGHT = 24;
const OVERSCAN = 10;

export interface DiffViewerProps {
  detail: DiffFileDetail;
  mode?: DiffViewMode;
  onModeChange?: (mode: DiffViewMode) => void;
  /** Called by the `Load file` affordance on a collapsed file. */
  onLoadFile?: () => void;
  /** Injected for tests; defaults to the worker-backed highlighter. */
  highlighter?: DiffHighlighter;
  rowHeight?: number;
  className?: string;
}

function rowCells(row: DiffRow): DiffCell[] {
  const cells: DiffCell[] = [];
  if (row.cell) cells.push(row.cell);
  if (row.left) cells.push(row.left);
  if (row.right && row.right !== row.left) cells.push(row.right);
  return cells;
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

interface Segment {
  start: number;
  end: number;
  syntax?: Pick<HighlightSpan, "light" | "dark">;
  changed: boolean;
}

/** Intersect syntax tokens with word-diff spans into one render segmentation. */
function buildSegments(
  length: number,
  highlight: HighlightSpan[] | undefined,
  wordSpans: WordSpan[],
): Segment[] {
  const boundaries = new Set<number>([0, length]);
  for (const span of highlight ?? []) {
    if (span.start >= 0 && span.end <= length) {
      boundaries.add(span.start);
      boundaries.add(span.end);
    }
  }
  for (const span of wordSpans) {
    boundaries.add(span.start);
    boundaries.add(span.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end <= start) continue;
    const syntax = highlight?.find(
      (span) => span.start <= start && span.end >= end,
    );
    const changed = wordSpans.some(
      (span) => span.start <= start && span.end >= end,
    );
    segments.push({ start, end, syntax, changed });
  }
  return segments;
}

/**
 * Both themes' colours ride on the token as custom properties; the
 * `syntax-token` utility picks one by the active theme, in CSS. A theme swap
 * therefore repaints without another highlight request.
 */
function syntaxColors(
  syntax: Pick<HighlightSpan, "light" | "dark"> | undefined,
): React.CSSProperties | undefined {
  if (syntax === undefined || (syntax.light === "" && syntax.dark === "")) {
    return undefined;
  }
  return {
    ...(syntax.light !== "" && { "--syntax-light": syntax.light }),
    ...(syntax.dark !== "" && { "--syntax-dark": syntax.dark }),
  } as React.CSSProperties;
}

function CellText({
  cell,
  highlight,
  wordSpans,
}: {
  cell: DiffCell;
  highlight: HighlightSpan[] | undefined;
  wordSpans: WordSpan[];
}) {
  const fill =
    cell.kind === "Addition"
      ? "bg-diff-added/32"
      : cell.kind === "Deletion"
        ? "bg-diff-removed/32"
        : undefined;
  const segments = buildSegments(cell.text.length, highlight, wordSpans);
  return (
    <span className="whitespace-pre">
      {segments.map((segment) => {
        const colors = syntaxColors(segment.syntax);
        return (
          <span
            key={`${segment.start}-${segment.end}`}
            style={colors}
            className={
              [colors ? "syntax-token" : "", segment.changed ? fill : ""]
                .filter(Boolean)
                .join(" ") || undefined
            }
          >
            {cell.text.slice(segment.start, segment.end)}
          </span>
        );
      })}
    </span>
  );
}

function Gutter({ cell }: { cell: DiffCell }) {
  if (cell.gutter === null) {
    return <span className="w-3 shrink-0" aria-hidden="true" />;
  }
  return (
    <span
      data-gutter={cell.gutter}
      aria-hidden="true"
      className={`w-3 shrink-0 text-center ${
        cell.gutter === "+" ? "text-diff-added" : "text-diff-removed"
      }`}
    >
      {cell.gutter}
    </span>
  );
}

function UnifiedRow({
  row,
  highlight,
  getWordSpans,
}: {
  row: DiffRow;
  highlight: Map<string, HighlightSpan[]>;
  getWordSpans: (cell: DiffCell) => WordSpan[];
}) {
  const cell = row.cell;
  if (!cell) return null;
  const fill =
    row.kind === "addition"
      ? "bg-diff-added/16"
      : row.kind === "deletion"
        ? "bg-diff-removed/16"
        : undefined;
  return (
    <div
      data-row-kind={row.kind}
      className={`flex h-6 items-center gap-2 px-2 font-mono text-mono-code ${fill ?? ""}`}
    >
      <span className="w-10 shrink-0 text-right text-mono-micro text-(--tethys-text-on-sunken-muted)">
        {cell.oldLine ?? ""}
      </span>
      <span className="w-10 shrink-0 text-right text-mono-micro text-(--tethys-text-on-sunken-muted)">
        {cell.newLine ?? ""}
      </span>
      <Gutter cell={cell} />
      <CellText
        cell={cell}
        highlight={highlight.get(cell.anchorId)}
        wordSpans={getWordSpans(cell)}
      />
    </div>
  );
}

function SplitRow({
  row,
  highlight,
  getWordSpans,
}: {
  row: DiffRow;
  highlight: Map<string, HighlightSpan[]>;
  getWordSpans: (cell: DiffCell) => WordSpan[];
}) {
  const leftFill =
    row.left?.kind === "Deletion"
      ? "bg-diff-removed/16"
      : row.left?.kind === "Addition"
        ? "bg-diff-added/16"
        : undefined;
  const rightFill =
    row.right?.kind === "Addition"
      ? "bg-diff-added/16"
      : row.right?.kind === "Deletion"
        ? "bg-diff-removed/16"
        : undefined;
  return (
    <div
      data-row-kind="pair"
      className="flex h-6 items-stretch font-mono text-mono-code"
    >
      <div
        className={`flex w-1/2 items-center gap-2 border-r border-(--tethys-hairline-on-sunken) px-2 ${leftFill ?? ""}`}
      >
        <span className="w-10 shrink-0 text-right text-mono-micro text-(--tethys-text-on-sunken-muted)">
          {row.left?.oldLine ?? row.left?.newLine ?? ""}
        </span>
        {row.left ? <Gutter cell={row.left} /> : null}
        {row.left ? (
          <CellText
            cell={row.left}
            highlight={highlight.get(row.left.anchorId)}
            wordSpans={getWordSpans(row.left)}
          />
        ) : null}
      </div>
      <div className={`flex w-1/2 items-center gap-2 px-2 ${rightFill ?? ""}`}>
        <span className="w-10 shrink-0 text-right text-mono-micro text-(--tethys-text-on-sunken-muted)">
          {row.right?.newLine ?? row.right?.oldLine ?? ""}
        </span>
        {row.right ? <Gutter cell={row.right} /> : null}
        {row.right ? (
          <CellText
            cell={row.right}
            highlight={highlight.get(row.right.anchorId)}
            wordSpans={getWordSpans(row.right)}
          />
        ) : null}
      </div>
    </div>
  );
}

export function DiffViewer({
  detail,
  mode: controlledMode,
  onModeChange,
  onLoadFile,
  highlighter,
  rowHeight = DEFAULT_ROW_HEIGHT,
  className,
}: DiffViewerProps) {
  const [internalMode, setInternalMode] = useState<DiffViewMode>("unified");
  const mode = controlledMode ?? internalMode;
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

  const cellIndex = useMemo(() => {
    const index = new Map<string, DiffCell>();
    for (const row of rows) {
      for (const cell of rowCells(row)) {
        index.set(cell.anchorId, cell);
      }
    }
    return index;
  }, [rows]);

  // Word spans are computed lazily for visible cells only (M1.9 U2), cached by
  // the pair so scrolling back to a line does not re-run the LCS.
  const wordCache = useRef(new Map<string, WordSpan[]>());
  const getWordSpans = (cell: DiffCell): WordSpan[] => {
    if (cell.facingAnchorId === null) {
      return [];
    }
    const key = `${cell.anchorId}->${cell.facingAnchorId}`;
    const cached = wordCache.current.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const facing = cellIndex.get(cell.facingAnchorId);
    if (facing === undefined) {
      return [];
    }
    // Diff old→new so the returned spans index into this cell's own text: a
    // deletion is the old side, an addition is the new side.
    const isDeletion = cell.kind === "Deletion";
    const { oldSpans, newSpans } = isDeletion
      ? diffWordSpans(cell.text, facing.text)
      : diffWordSpans(facing.text, cell.text);
    const spans = isDeletion ? oldSpans : newSpans;
    wordCache.current.set(key, spans);
    return spans;
  };

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
      data-testid="diff-viewer"
      data-mode={mode}
      aria-label={`Diff for ${detail.path}`}
      className={`flex min-h-0 flex-col overflow-hidden rounded-md border border-(--tethys-hairline-on-sunken) bg-(--tethys-surface-sunken) font-mono text-mono-code text-(--tethys-text-on-sunken) ${className ?? ""}`}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-(--tethys-hairline) bg-(--tethys-surface-panel) px-2 py-1">
        <span className="truncate text-mono-micro text-(--tethys-text-muted)">
          {detail.path}
        </span>
        <SegmentedControl
          size="sm"
          options={[
            { value: "unified", label: "Unified" },
            { value: "split", label: "Split" },
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
              width: "100%",
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
                    <div className="flex h-6 items-center bg-(--tethys-wash-on-sunken) px-2 text-mono-micro text-(--tethys-text-on-sunken-muted)">
                      {`@@ -${row.header.oldStart},${row.header.oldLines} +${row.header.newStart},${row.header.newLines} @@`}
                    </div>
                  ) : mode === "split" ? (
                    <SplitRow
                      row={row}
                      highlight={highlight}
                      getWordSpans={getWordSpans}
                    />
                  ) : (
                    <UnifiedRow
                      row={row}
                      highlight={highlight}
                      getWordSpans={getWordSpans}
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
