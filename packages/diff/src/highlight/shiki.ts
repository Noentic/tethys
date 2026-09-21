/**
 * The actual Shiki call (M1.9 U3). Shiki is imported lazily so neither the
 * worker entry nor the client facade pulls a grammar bundle at module load, and
 * an unknown grammar or a failed load degrades to plain text rather than
 * throwing.
 *
 * Both themes are tokenised at once (`codeToTokensWithThemes`) and the viewer
 * picks a colour per token in CSS, so a theme swap repaints without calling the
 * worker again. The palette is kept legible by construction: each theme starts
 * from a bundled GitHub theme and any token colour that misses
 * `SYNTAX_MIN_CONTRAST` against that theme's well is moved along its own hue
 * until it clears it. No bundled light theme clears it on the slate well, and
 * the previous dark theme (`github-dark`) missed it on comments.
 */

import { ensureContrast } from "./contrast";
import type { HighlightLines } from "./protocol";

/**
 * The two `surface-sunken` values the palette is checked against. The worker
 * cannot read CSS, so it carries them; `shiki.test.ts` asserts they equal the
 * default themes' tokens.
 */
export const SYNTAX_WELLS = { light: "#e4e4e7", dark: "#050507" } as const;

/** WCAG AA for normal text: the same bar the contract sets for `diff-added`. */
export const SYNTAX_MIN_CONTRAST = 4.5;

const BASE_THEMES = {
  light: "github-light-default",
  dark: "github-dark-default",
} as const;

type Variant = keyof typeof BASE_THEMES;

async function themeFor(variant: Variant) {
  const { bundledThemes } = await import("shiki");
  const load = bundledThemes[BASE_THEMES[variant]];
  const { default: base } = await load();
  const well = SYNTAX_WELLS[variant];
  const legible = (color: string) =>
    ensureContrast(color, well, SYNTAX_MIN_CONTRAST);
  return {
    ...base,
    name: `tethys-${variant}`,
    colors: {
      ...base.colors,
      "editor.foreground": legible(base.colors?.["editor.foreground"] ?? ""),
    },
    tokenColors: (base.tokenColors ?? []).map((rule) => ({
      ...rule,
      settings: {
        ...rule.settings,
        ...(rule.settings?.foreground
          ? { foreground: legible(rule.settings.foreground) }
          : {}),
      },
    })),
  };
}

let themes: Promise<{
  light: Awaited<ReturnType<typeof themeFor>>;
  dark: Awaited<ReturnType<typeof themeFor>>;
}> | null = null;

function loadThemes() {
  themes ??= Promise.all([themeFor("light"), themeFor("dark")]).then(
    ([light, dark]) => ({ light, dark }),
  );
  return themes;
}

/**
 * Highlight `text` into per-line token spans, each with a colour per theme.
 * Returns `[]` when the language is unknown, the text is empty, or Shiki cannot
 * load the grammar.
 */
export async function highlightLines(
  text: string,
  language: string,
): Promise<HighlightLines> {
  if (language === "" || text === "") {
    return [];
  }
  try {
    const { codeToTokensWithThemes } = await import("shiki");
    const lines = await codeToTokensWithThemes(text, {
      lang: language as never,
      themes: await loadThemes(),
    });
    return lines.map((line) => {
      let offset = 0;
      return line.map((token) => {
        const start = offset;
        const end = start + token.content.length;
        offset = end;
        return {
          start,
          end,
          light: token.variants.light?.color ?? "",
          dark: token.variants.dark?.color ?? "",
          fontStyle: token.variants.light?.fontStyle,
        };
      });
    });
  } catch {
    return [];
  }
}
