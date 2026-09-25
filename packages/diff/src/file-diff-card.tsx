/**
 * `file-diff-card` (DESIGN.md): one file an agent edited, as it reads in the
 * transcript — the path and its `+a −b` on a header row, then the changed
 * hunks with old and new line numbers. It draws the same rows as the Changes
 * panel (`diff-rows`), unvirtualized because a tool edit is a few hunks, and
 * caps the height so a large write never floods the stage; the full file is
 * one action away in the Changes panel.
 */

import type { DiffFileDetail } from "@tethys/bindings";
import { cn, TruncatedText } from "@tethys/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { HunkHeaderRow, rowCells, UnifiedRow, useWordSpans } from "./diff-rows";
import {
  createDiffHighlighter,
  type DiffHighlighter,
} from "./highlight/client";
import type { HighlightSpan } from "./highlight/protocol";
import { buildDiffRows, type DiffCell } from "./row-model";

/** Rows shown before `Show all`; past it the card would outgrow the turn. */
const PREVIEW_ROWS = 40;
/** Line numbers, gutter glyph, gaps and padding of a row, in px. */
const ROW_CHROME_PX = 140;

export interface FileDiffCardProps {
  detail: DiffFileDetail;
  /** What happened to the file, leading the header: `Edited`, `Created`, `Deleted`. */
  verb?: string;
  /** Opens the file in the Changes panel; absent where there is no git. */
  onOpen?: () => void;
  /** Rows shown before `Show all`; a docked preview keeps it short. */
  previewRows?: number;
  highlighter?: DiffHighlighter;
  className?: string;
}

let sharedHighlighter: DiffHighlighter | null = null;
function defaultHighlighter(): DiffHighlighter {
  sharedHighlighter ??= createDiffHighlighter();
  return sharedHighlighter;
}

export function DiffStat({
  additions,
  deletions,
  className,
}: {
  additions: number;
  deletions: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 font-mono text-mono-micro whitespace-nowrap",
        className,
      )}
    >
      <span className="text-diff-added">+{additions}</span>
      <span className="text-diff-removed">−{deletions}</span>
    </span>
  );
}

export function FileDiffCard({
  detail,
  verb,
  onOpen,
  previewRows = PREVIEW_ROWS,
  highlighter,
  className,
}: FileDiffCardProps) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => buildDiffRows(detail, "unified"), [detail]);
  const shown = expanded ? rows : rows.slice(0, previewRows);
  const hidden = rows.length - shown.length;
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
      for (const cell of rowCells(row)) index.set(cell.anchorId, cell);
    }
    return index;
  }, [rows]);
  const getWordSpans = useWordSpans(cellIndex);

  const [highlight, setHighlight] = useState<Map<string, HighlightSpan[]>>(
    () => new Map(),
  );
  const activeHighlighter = highlighter ?? defaultHighlighter();
  const requested = useRef(new Set<string>());
  useEffect(() => {
    const wanted = shown
      .flatMap(rowCells)
      .filter((cell) => !requested.current.has(cell.anchorId));
    if (wanted.length === 0) return;
    for (const cell of wanted) requested.current.add(cell.anchorId);
    let cancelled = false;
    void Promise.all(
      wanted.map(async (cell) => {
        const lines = await activeHighlighter.highlight(cell.text, detail.path);
        return [cell.anchorId, lines[0] ?? []] as const;
      }),
    )
      .then((entries) => {
        const decorated = entries.filter(([, spans]) => spans.length > 0);
        if (cancelled || decorated.length === 0) return;
        setHighlight((previous) => new Map([...previous, ...decorated]));
      })
      .catch(() => {
        // Highlighting is decoration: plain text is a complete rendering.
      });
    return () => {
      cancelled = true;
    };
  }, [shown, activeHighlighter, detail.path]);

  return (
    <section
      data-testid="file-diff-card"
      aria-label={`Diff for ${detail.path}`}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-md border border-(--tethys-hairline-on-sunken) bg-(--tethys-surface-sunken) text-(--tethys-text-on-sunken)",
        className,
      )}
    >
      <header className="flex min-h-8 min-w-0 items-center gap-sm border-b border-(--tethys-hairline-on-sunken) px-2.5 py-1">
        {verb && (
          <span className="shrink-0 text-label-md text-(--tethys-text-on-sunken-secondary)">
            {verb}
          </span>
        )}
        <TruncatedText
          mode="path"
          text={detail.path}
          className="min-w-0 flex-1 font-mono text-mono-micro text-(--tethys-text-on-sunken)"
        />
        <DiffStat additions={detail.additions} deletions={detail.deletions} />
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="focus-ring shrink-0 rounded-xs px-1.5 py-0.5 text-label-sm text-(--tethys-text-on-sunken-secondary) hover:bg-(--tethys-wash-on-sunken) hover:text-(--tethys-text-on-sunken)"
          >
            Open in Changes
          </button>
        )}
      </header>
      <div className="overflow-x-auto">
        <div
          style={{
            width: `max(100%, calc(${longestLine}ch + ${ROW_CHROME_PX}px))`,
          }}
        >
          {shown.map((row, index) =>
            row.kind === "hunk-header" && row.header ? (
              index === 0 ? null : (
                <HunkHeaderRow key={`h-${row.hunkIndex}`} header={row.header} />
              )
            ) : (
              <UnifiedRow
                key={row.anchorId ?? `r-${index}`}
                row={row}
                highlight={highlight}
                getWordSpans={getWordSpans}
              />
            ),
          )}
        </div>
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="focus-ring-inset flex h-7 items-center justify-center border-t border-(--tethys-hairline-on-sunken) text-label-sm text-(--tethys-text-on-sunken-muted) hover:bg-(--tethys-wash-on-sunken) hover:text-(--tethys-text-on-sunken)"
        >
          Show {hidden} more line{hidden === 1 ? "" : "s"}
        </button>
      )}
    </section>
  );
}
