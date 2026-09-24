/**
 * The diff's row primitives, shared by the virtualized `DiffViewer` (the
 * Changes panel) and the compact `FileDiffCard` (a file edit in the
 * transcript), so one change reads the same wherever it is shown.
 *
 * A changed line is carried by three channels, never colour alone: a 16% fill,
 * the `+` / `−` gutter glyph, and an edge bar that is solid for an addition
 * and hatched for a deletion (DESIGN.md `diff-viewer.gutterMark`, `changeBar`).
 */

import type React from "react";
import { useRef } from "react";
import type { HighlightSpan } from "./highlight/protocol";
import type { DiffCell, DiffRow, HunkHeader } from "./row-model";
import { diffWordSpans, type WordSpan } from "./word-diff";

export function rowCells(row: DiffRow): DiffCell[] {
  const cells: DiffCell[] = [];
  if (row.cell) cells.push(row.cell);
  if (row.left) cells.push(row.left);
  if (row.right && row.right !== row.left) cells.push(row.right);
  return cells;
}

/**
 * Word spans for a changed line against the line it replaced, computed on
 * first request and cached by the pair, so only rows that render ever run the
 * LCS (M1.9 U2) and scrolling back never recomputes one.
 */
export function useWordSpans(
  cellIndex: Map<string, DiffCell>,
): (cell: DiffCell) => WordSpan[] {
  const cache = useRef(new Map<string, WordSpan[]>());
  return (cell: DiffCell): WordSpan[] => {
    if (cell.facingAnchorId === null) {
      return [];
    }
    const key = `${cell.anchorId}->${cell.facingAnchorId}`;
    const cached = cache.current.get(key);
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
    cache.current.set(key, spans);
    return spans;
  };
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

/** The edge bar of a changed line: solid for an addition, hatched for a deletion. */
function ChangeBar({ kind }: { kind: DiffCell["kind"] | undefined }) {
  if (kind !== "Addition" && kind !== "Deletion") return null;
  return (
    <span
      aria-hidden="true"
      className={`absolute inset-y-0 left-0 w-[3px] ${
        kind === "Addition" ? "bg-diff-added" : "diff-hatch-removed"
      }`}
    />
  );
}

/**
 * A hunk's `@@` line. Where the hunk can be thrown away, its `Discard` sits on
 * this row, beside what it discards, rather than in a strip above the diff.
 */
export function HunkHeaderRow({
  header,
  hunkNumber,
  onDiscard,
}: {
  header: HunkHeader;
  /** 1-based, for the discard control's accessible name. */
  hunkNumber?: number;
  onDiscard?: () => void;
}) {
  return (
    <div className="sticky left-0 flex h-6 items-center gap-2 bg-(--tethys-wash-on-sunken) px-2 text-mono-micro text-(--tethys-text-on-sunken-muted)">
      <span className="min-w-0 truncate">
        {`@@ -${header.oldStart},${header.oldLines} +${header.newStart},${header.newLines} @@`}
      </span>
      {onDiscard && (
        <button
          type="button"
          aria-label={`Discard hunk ${hunkNumber ?? ""}`.trim()}
          title="Discard this hunk"
          onClick={onDiscard}
          className="focus-ring ml-auto shrink-0 rounded-xs px-1.5 text-(--tethys-status-danger) hover:bg-(--tethys-status-danger-soft)"
        >
          Discard
        </button>
      )}
    </div>
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

function LineNumber({
  line,
  onCommentLine,
}: {
  line: number | null;
  onCommentLine?: (line: number) => void;
}) {
  const className =
    "w-10 shrink-0 text-right text-mono-micro text-(--tethys-text-on-sunken-muted)";
  if (line === null) return <span className={className} aria-hidden="true" />;
  return onCommentLine ? (
    <button
      type="button"
      aria-label={`Comment on line ${line}`}
      title={`Comment on line ${line}`}
      onClick={() => onCommentLine(line)}
      className={`${className} focus-ring rounded-xs hover:text-(--tethys-text-on-sunken)`}
    >
      {line}
    </button>
  ) : (
    <span className={className}>{line}</span>
  );
}

export function UnifiedRow({
  row,
  highlight,
  getWordSpans,
  onCommentLine,
}: {
  row: DiffRow;
  highlight: Map<string, HighlightSpan[]>;
  getWordSpans: (cell: DiffCell) => WordSpan[];
  onCommentLine?: (line: number) => void;
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
      className={`relative flex h-6 items-center gap-2 px-2 font-mono text-mono-code ${fill ?? ""}`}
    >
      <ChangeBar kind={cell.kind} />
      <LineNumber
        line={cell.oldLine}
        onCommentLine={cell.newLine === null ? onCommentLine : undefined}
      />
      <LineNumber line={cell.newLine} onCommentLine={onCommentLine} />
      <Gutter cell={cell} />
      <CellText
        cell={cell}
        highlight={highlight.get(cell.anchorId)}
        wordSpans={getWordSpans(cell)}
      />
    </div>
  );
}

export function SplitRow({
  row,
  highlight,
  getWordSpans,
  onCommentLine,
}: {
  row: DiffRow;
  highlight: Map<string, HighlightSpan[]>;
  getWordSpans: (cell: DiffCell) => WordSpan[];
  onCommentLine?: (line: number) => void;
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
        className={`relative flex w-1/2 min-w-0 items-center gap-2 overflow-hidden border-r border-(--tethys-hairline-on-sunken) px-2 ${leftFill ?? ""}`}
      >
        <ChangeBar kind={row.left?.kind} />
        <LineNumber
          line={row.left?.oldLine ?? row.left?.newLine ?? null}
          onCommentLine={onCommentLine}
        />
        {row.left ? <Gutter cell={row.left} /> : null}
        {row.left ? (
          <CellText
            cell={row.left}
            highlight={highlight.get(row.left.anchorId)}
            wordSpans={getWordSpans(row.left)}
          />
        ) : null}
      </div>
      <div
        className={`relative flex w-1/2 min-w-0 items-center gap-2 overflow-hidden px-2 ${rightFill ?? ""}`}
      >
        <ChangeBar kind={row.right?.kind} />
        <LineNumber
          line={row.right?.newLine ?? row.right?.oldLine ?? null}
          onCommentLine={onCommentLine}
        />
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
