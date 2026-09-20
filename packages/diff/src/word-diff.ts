/**
 * Client-side word-level intra-line diff (M1.9 U2).
 *
 * The git engine computes diffs at line granularity, so the 32% word fill
 * DESIGN `diff-viewer` asks for has to be derived here. A longest-common-
 * subsequence over word tokens marks the spans that changed; unchanged spans
 * keep the 16% line fill. Presentation-only: nothing here affects stage,
 * discard or commit, which key off the engine's hunk refs.
 */

/** A half-open `[start, end)` range within one line's text. */
export interface WordSpan {
  start: number;
  end: number;
}

interface Token {
  value: string;
  start: number;
  end: number;
}

/**
 * Split a line into word tokens, whitespace tokens and single punctuation
 * tokens. Keeping whitespace as a token means a re-indentation shows precisely
 * instead of widening to the whole line.
 */
export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g;
  let match = pattern.exec(line);
  while (match !== null) {
    tokens.push({
      value: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
    match = pattern.exec(line);
  }
  return tokens;
}

function spansFrom(tokens: Token[], matched: boolean[]): WordSpan[] {
  const spans: WordSpan[] = [];
  let open: WordSpan | null = null;
  for (let index = 0; index < tokens.length; index += 1) {
    if (matched[index]) {
      if (open !== null) {
        spans.push(open);
        open = null;
      }
      continue;
    }
    const token = tokens[index];
    if (open === null) {
      open = { start: token.start, end: token.end };
    } else {
      open.end = token.end;
    }
  }
  if (open !== null) {
    spans.push(open);
  }
  return spans;
}

/**
 * Pair two changed lines and mark the spans that differ on each side. Returns
 * empty spans when nothing common survives (a full rewrite marks the whole
 * line) — a change is never hidden behind a misleading "unchanged" gap.
 *
 * ponytail: O(n·m) LCS over one line's tokens; a pathological multi-thousand-
 * token line is the only ceiling. Swap for a diff crate if that ever shows up.
 */
export function diffWordSpans(
  oldText: string,
  newText: string,
): { oldSpans: WordSpan[]; newSpans: WordSpan[] } {
  const oldTokens = tokenizeLine(oldText);
  const newTokens = tokenizeLine(newText);
  const n = oldTokens.length;
  const m = newTokens.length;

  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        oldTokens[i].value === newTokens[j].value
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const oldMatched = new Array<boolean>(n).fill(false);
  const newMatched = new Array<boolean>(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldTokens[i].value === newTokens[j].value) {
      oldMatched[i] = true;
      newMatched[j] = true;
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  // A rewrite can still share only whitespace tokens; matching those would
  // leave misleading "unchanged" gaps, so the whole line reads as changed.
  const hasContentMatch = (tokens: Token[], matched: boolean[]): boolean =>
    tokens.some((token, index) => matched[index] && /\S/.test(token.value));

  if (!hasContentMatch(oldTokens, oldMatched)) {
    oldMatched.fill(false);
  }
  if (!hasContentMatch(newTokens, newMatched)) {
    newMatched.fill(false);
  }

  return {
    oldSpans: spansFrom(oldTokens, oldMatched),
    newSpans: spansFrom(newTokens, newMatched),
  };
}
