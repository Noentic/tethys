/**
 * Wire contract between the main thread and the highlight worker (M1.9 U3).
 * Kept free of DOM and Shiki imports so the worker entry has no top-level
 * side effects and stays importable under jsdom.
 */

/** One coloured run within a line, half-open `[start, end)`. */
export interface HighlightSpan {
  start: number;
  end: number;
  color: string;
  /** Shiki font-style bit flags: 1 italic, 2 bold, 4 underline. */
  fontStyle?: number;
}

/** Token spans per line, indexed to match the highlighted text's lines. */
export type HighlightLines = HighlightSpan[][];

export interface HighlightRequest {
  id: number;
  text: string;
  language: string;
}

export interface HighlightResponse {
  id: number;
  lines: HighlightLines;
}

/**
 * Cheap content hash for the highlight cache. The engine's blake3 pair-key is
 * not on the `DiffFileDetail` wire, so the client hashes the text it holds; a
 * 32-bit FNV-1a is enough to key a view cache and adds no dependency.
 */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
