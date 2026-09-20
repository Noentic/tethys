/**
 * The pure diff row model (M1.9 U1/U2).
 *
 * The Rust engine already returns structured hunks (`DiffFileDetail` with
 * `DiffHunk`/`DiffLine`), so there is no TypeScript patch parser: this module
 * only flattens those hunks into virtualizer rows (unified) and pairs them into
 * split columns, attaches gutter glyphs and word-diff spans, and derives the
 * stable scroll anchor a view-mode toggle preserves.
 *
 * No React import: this is testable as plain data.
 */

import type {
  DiffFileDetail,
  DiffHunk,
  DiffLine,
  DiffLineKind,
} from "@tethys/bindings";
import type { WordSpan } from "./word-diff";

export type DiffViewMode = "unified" | "split";

export type DiffRowKind =
  | "hunk-header"
  | "context"
  | "addition"
  | "deletion"
  | "pair"
  | "collapsed-context";

export interface DiffCell {
  kind: DiffLineKind;
  oldLine: number | null;
  newLine: number | null;
  text: string;
  /** Stable identity of this source line across view modes. */
  anchorId: string;
  gutter: "+" | "−" | null;
  /**
   * The opposite-side line this change replaced (deletion↔addition), if any.
   * Word spans are computed lazily from the pair by the viewer so the full-file
   * row model never runs an LCS (M1.9 U2: only on-screen paired rows).
   */
  facingAnchorId: string | null;
  /** 32% fill spans; empty for context or unpaired changed lines. */
  wordSpans: WordSpan[];
}

export interface HunkHeader {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

export interface DiffRow {
  kind: DiffRowKind;
  hunkIndex: number | null;
  /** Primary anchor: the new-side line for split pairs, else the cell's. */
  anchorId: string | null;
  /** Every source-line anchor this row contains (a split pair has up to two). */
  anchorIds: string[];
  cell?: DiffCell;
  left?: DiffCell;
  right?: DiffCell;
  header?: HunkHeader;
  text?: string;
}

function anchorId(hunkIndex: number, kind: DiffLineKind, line: number): string {
  return `${hunkIndex}:${kind.toLowerCase()}:${line}`;
}

function cell(
  hunkIndex: number,
  line: DiffLine,
  oldLine: number | null,
  newLine: number | null,
): DiffCell {
  const kind = line.kind;
  const anchorLine =
    kind === "Deletion" ? (oldLine ?? 0) : (newLine ?? oldLine ?? 0);
  return {
    kind,
    oldLine,
    newLine,
    text: line.text,
    anchorId: anchorId(hunkIndex, kind, anchorLine),
    gutter: kind === "Addition" ? "+" : kind === "Deletion" ? "−" : null,
    facingAnchorId: null,
    wordSpans: [],
  };
}

function hunkHeaderRow(hunkIndex: number, hunk: DiffHunk): DiffRow {
  return {
    kind: "hunk-header",
    hunkIndex,
    anchorId: `h${hunkIndex}`,
    anchorIds: [],
    header: {
      oldStart: hunk.old_start,
      oldLines: hunk.old_lines,
      newStart: hunk.new_start,
      newLines: hunk.new_lines,
    },
  };
}

function markerRow(text: string): DiffRow {
  return {
    kind: "collapsed-context",
    hunkIndex: null,
    anchorId: null,
    anchorIds: [],
    text,
  };
}

function isCollapsed(detail: DiffFileDetail): boolean {
  return detail.collapsed || detail.binary;
}

function markerText(detail: DiffFileDetail): string {
  if (detail.binary) {
    return "Binary file — not shown";
  }
  const changed = detail.additions + detail.deletions;
  return `${changed} changed lines — file too large to display`;
}

/** Flatten a file detail into unified rows: hunk header, then every line. */
function buildUnifiedRows(detail: DiffFileDetail): DiffRow[] {
  const rows: DiffRow[] = [];
  detail.hunks.forEach((hunk, hunkIndex) => {
    rows.push(hunkHeaderRow(hunkIndex, hunk));
    let oldLine = hunk.old_start;
    let newLine = hunk.new_start;
    for (const line of hunk.lines) {
      if (line.kind === "Deletion") {
        rows.push({
          kind: "deletion",
          hunkIndex,
          anchorId: anchorId(hunkIndex, "Deletion", oldLine),
          anchorIds: [],
          cell: cell(hunkIndex, line, oldLine, null),
        });
        oldLine += 1;
      } else if (line.kind === "Addition") {
        rows.push({
          kind: "addition",
          hunkIndex,
          anchorId: anchorId(hunkIndex, "Addition", newLine),
          anchorIds: [],
          cell: cell(hunkIndex, line, null, newLine),
        });
        newLine += 1;
      } else {
        rows.push({
          kind: "context",
          hunkIndex,
          anchorId: anchorId(hunkIndex, "Context", newLine),
          anchorIds: [],
          cell: cell(hunkIndex, line, oldLine, newLine),
        });
        oldLine += 1;
        newLine += 1;
      }
    }
  });
  attachUnifiedPairings(rows);
  return attachRowAnchors(rows);
}

/**
 * Link each deletion run to the addition run that follows it so unified rows
 * expose the same pairings split rows do.
 */
function attachUnifiedPairings(rows: DiffRow[]): void {
  let index = 0;
  while (index < rows.length) {
    if (rows[index].kind !== "deletion") {
      index += 1;
      continue;
    }
    let deletionEnd = index;
    while (deletionEnd < rows.length && rows[deletionEnd].kind === "deletion") {
      deletionEnd += 1;
    }
    let additionEnd = deletionEnd;
    while (additionEnd < rows.length && rows[additionEnd].kind === "addition") {
      additionEnd += 1;
    }
    const deletions = rows.slice(index, deletionEnd);
    const additions = rows.slice(deletionEnd, additionEnd);
    const pairs = Math.min(deletions.length, additions.length);
    for (let pair = 0; pair < pairs; pair += 1) {
      const left = deletions[pair].cell;
      const right = additions[pair].cell;
      if (left && right) {
        linkPair(left, right);
      }
    }
    index = additionEnd > index ? additionEnd : index + 1;
  }
}

/** Record the two sides of a changed line as each other's facing pair. */
function linkPair(left: DiffCell, right: DiffCell): void {
  left.facingAnchorId = right.anchorId;
  right.facingAnchorId = left.anchorId;
}

function pairRow(
  hunkIndex: number,
  left: DiffCell | undefined,
  right: DiffCell | undefined,
): DiffRow {
  const anchorIds: string[] = [];
  if (left) anchorIds.push(left.anchorId);
  if (right && right.anchorId !== left?.anchorId) {
    anchorIds.push(right.anchorId);
  }
  return {
    kind: "pair",
    hunkIndex,
    anchorId: right?.anchorId ?? left?.anchorId ?? null,
    anchorIds,
    left,
    right,
  };
}

/** Pair hunks into split columns so deletions face the additions they became. */
function buildSplitRows(detail: DiffFileDetail): DiffRow[] {
  const rows: DiffRow[] = [];
  detail.hunks.forEach((hunk, hunkIndex) => {
    rows.push(hunkHeaderRow(hunkIndex, hunk));
    let oldLine = hunk.old_start;
    let newLine = hunk.new_start;
    let index = 0;
    const lines = hunk.lines;
    while (index < lines.length) {
      const line = lines[index];
      if (line.kind === "Context") {
        const both = cell(hunkIndex, line, oldLine, newLine);
        rows.push(pairRow(hunkIndex, both, both));
        oldLine += 1;
        newLine += 1;
        index += 1;
        continue;
      }

      const deletions: DiffLine[] = [];
      const additions: DiffLine[] = [];
      while (index < lines.length && lines[index].kind !== "Context") {
        const changed = lines[index];
        if (changed.kind === "Deletion") {
          deletions.push(changed);
        } else {
          additions.push(changed);
        }
        index += 1;
      }

      const pairCount = Math.max(deletions.length, additions.length);
      for (let pair = 0; pair < pairCount; pair += 1) {
        const left =
          pair < deletions.length
            ? cell(hunkIndex, deletions[pair], oldLine, null)
            : undefined;
        const right =
          pair < additions.length
            ? cell(hunkIndex, additions[pair], null, newLine)
            : undefined;
        if (left) oldLine += 1;
        if (right) newLine += 1;
        if (left && right) {
          linkPair(left, right);
        }
        rows.push(pairRow(hunkIndex, left, right));
      }
    }
  });
  return attachRowAnchors(rows);
}

/** Keep `anchorIds` populated for every row, including unified rows. */
function attachRowAnchors(rows: DiffRow[]): DiffRow[] {
  return rows.map((row) => {
    if (row.anchorIds.length > 0) {
      return row;
    }
    return {
      ...row,
      anchorIds: row.anchorId !== null ? [row.anchorId] : [],
    };
  });
}

export function buildDiffRows(
  detail: DiffFileDetail,
  mode: DiffViewMode,
): DiffRow[] {
  if (isCollapsed(detail)) {
    return [markerRow(markerText(detail))];
  }
  return mode === "split" ? buildSplitRows(detail) : buildUnifiedRows(detail);
}

const ANCHOR_PATTERN = /^(\d+):(context|addition|deletion):(\d+)$/;

/** Map every source-line anchor to its row, for scroll restoration. */
export function buildAnchorIndex(rows: DiffRow[]): Map<string, number> {
  const index = new Map<string, number>();
  rows.forEach((row, rowIndex) => {
    for (const anchor of row.anchorIds) {
      if (!index.has(anchor)) {
        index.set(anchor, rowIndex);
      }
    }
  });
  return index;
}

/**
 * Resolve an anchor to a row in `rows`. Exact match first; otherwise fall back
 * to the nearest following retained line in the same hunk (a change that has no
 * cell in the target mode never yanks the viewport to the file top).
 */
export function resolveAnchorIndex(
  rows: DiffRow[],
  anchor: string,
): number | undefined {
  const index = buildAnchorIndex(rows);
  const exact = index.get(anchor);
  if (exact !== undefined) {
    return exact;
  }

  const parsed = ANCHOR_PATTERN.exec(anchor);
  if (parsed === null) {
    return undefined;
  }
  const hunkIndex = Number(parsed[1]);
  const target = Number(parsed[3]);

  let best: { rowIndex: number; line: number } | undefined;
  rows.forEach((row, rowIndex) => {
    if (row.hunkIndex !== hunkIndex) {
      return;
    }
    for (const candidate of row.anchorIds) {
      const match = ANCHOR_PATTERN.exec(candidate);
      if (match === null) continue;
      const line = Number(match[3]);
      if (line < target) continue;
      if (best === undefined || line < best.line) {
        best = { rowIndex, line };
      }
    }
  });
  return best?.rowIndex;
}
