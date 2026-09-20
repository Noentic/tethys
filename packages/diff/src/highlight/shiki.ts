/**
 * The actual Shiki call (M1.9 U3). Shiki is imported lazily so neither the
 * worker entry nor the client facade pulls a grammar bundle at module load, and
 * an unknown grammar or a failed load degrades to plain text rather than
 * throwing.
 */

import type { HighlightLines } from "./protocol";

const THEME = "github-dark";

/**
 * Highlight `text` into per-line token spans. Returns `[]` when the language is
 * unknown, the text is empty, or Shiki cannot load the grammar.
 */
export async function highlightLines(
  text: string,
  language: string,
): Promise<HighlightLines> {
  if (language === "" || text === "") {
    return [];
  }
  try {
    const { codeToTokens } = await import("shiki");
    const { tokens } = await codeToTokens(text, {
      lang: language as never,
      theme: THEME as never,
    });
    return tokens.map((line) => {
      let offset = 0;
      return line.map((token) => {
        const start = offset;
        const end = start + token.content.length;
        offset = end;
        return {
          start,
          end,
          color: token.color ?? "",
          fontStyle: token.fontStyle,
        };
      });
    });
  } catch {
    return [];
  }
}
