/**
 * Tool-call diffs as `DiffFileDetail`, so a file edit in the transcript renders
 * with the same row model as the Changes panel. Agents describe an edit in one
 * of two shapes: a unified patch (ACP diff content, or OpenCode's
 * `rawOutput.metadata.diff`), or the text before and after (`oldString` /
 * `newString` in the tool input). Both are read with jsdiff; nothing here
 * parses a patch by hand.
 */

import type { DiffFileDetail, DiffHunk, DiffLine } from "@tethys/bindings";
import { parsePatch, structuredPatch } from "diff";

/** Context lines kept around each change, as `git diff` does. */
const CONTEXT_LINES = 3;

interface PatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

function toHunk(hunk: PatchHunk): DiffHunk {
  const lines: DiffLine[] = [];
  for (const raw of hunk.lines) {
    const sign = raw[0];
    // `\ No newline at end of file` annotates the line before; it is not one.
    if (sign === "\\") continue;
    const text = raw.slice(1);
    if (sign === "+") lines.push({ kind: "Addition", text });
    else if (sign === "-") lines.push({ kind: "Deletion", text });
    else lines.push({ kind: "Context", text });
  }
  return {
    old_start: hunk.oldStart,
    old_lines: hunk.oldLines,
    new_start: hunk.newStart,
    new_lines: hunk.newLines,
    lines,
  };
}

function detail(path: string, hunks: PatchHunk[]): DiffFileDetail {
  const converted = hunks.map(toHunk);
  let additions = 0;
  let deletions = 0;
  for (const hunk of converted) {
    for (const line of hunk.lines) {
      if (line.kind === "Addition") additions += 1;
      else if (line.kind === "Deletion") deletions += 1;
    }
  }
  return {
    path,
    binary: false,
    collapsed: false,
    additions,
    deletions,
    hunks: converted,
  };
}

/**
 * A unified patch for one file. A bare hunk list (`@@ … @@` with no file
 * headers, as Core emits) and a full `Index:` / `---` / `+++` patch both work;
 * a patch touching several files keeps the first file with hunks.
 */
export function detailFromPatch(
  path: string,
  patch: string,
): DiffFileDetail | null {
  if (!patch.includes("@@")) return null;
  let files: ReturnType<typeof parsePatch>;
  try {
    files = parsePatch(patch);
  } catch {
    return null;
  }
  const file = files.find((candidate) => candidate.hunks.length > 0);
  if (!file) return null;
  return detail(path, file.hunks);
}

/** The change between two texts of one file, with `CONTEXT_LINES` of context. */
export function detailFromTexts(
  path: string,
  before: string,
  after: string,
): DiffFileDetail | null {
  if (before === after) return null;
  const patch = structuredPatch(path, path, before, after, "", "", {
    context: CONTEXT_LINES,
  });
  if (patch.hunks.length === 0) return null;
  return detail(path, patch.hunks);
}
