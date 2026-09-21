import { DEFAULT_DARK_TOKENS, DEFAULT_LIGHT_TOKENS } from "@tethys/ui";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { highlightLines, SYNTAX_MIN_CONTRAST, SYNTAX_WELLS } from "./shiki";

// Realistic snippets whose comments, strings, keywords and punctuation cover the
// palette. Comments are what fail contrast in most bundled themes.
const FIXTURES: [language: string, text: string][] = [
  [
    "typescript",
    '// load the config\nimport { readFileSync } from "node:fs";\nexport async function load(path: string): Promise<Config | null> {\n  const raw = readFileSync(path, "utf-8"); /* block */\n  return JSON.parse(raw) as Config; // cast\n}\nconst re = /ab+c/gi; const n = 42;',
  ],
  [
    "rust",
    '// unit tests\n#[derive(Debug, Clone)]\npub struct Session<\'a> { id: &\'a str, turns: u32 }\nfn main() { let s = Session { id: "x", turns: 0 }; println!("{:?}", s); }',
  ],
  ["json", '{ "name": "tethys", "private": true, "n": 3, "x": null }'],
  [
    "css",
    "/* tokens */\n:root { --a: #0b0b0d; color: rgba(0,0,0,.5); }\n.a > .b:hover { margin: 0 auto; }",
  ],
  [
    "markdown",
    "# Title\n\nSome *emphasis* and **strong** with `code`.\n\n- [link](http://x.y)",
  ],
  [
    "bash",
    '# build\nset -euo pipefail\nfor f in *.rs; do echo "$f" >> out.txt; done',
  ],
];

describe("syntax highlighting follows the theme", () => {
  it("returns a light and a dark colour for every coloured token", async () => {
    for (const [language, text] of FIXTURES) {
      const lines = await highlightLines(text, language);
      expect(lines.length, language).toBeGreaterThan(0);
      const spans = lines.flat();
      expect(spans.length, language).toBeGreaterThan(0);
      for (const span of spans) {
        expect(span.light, `${language} light`).toMatch(/^#[0-9a-f]{6,8}$/i);
        expect(span.dark, `${language} dark`).toMatch(/^#[0-9a-f]{6,8}$/i);
      }
    }
  });

  it("keeps the two variants distinct: the palettes are not the same colours", async () => {
    const [, text] = FIXTURES[0];
    const spans = (await highlightLines(text, "typescript")).flat();
    expect(spans.some((span) => span.light !== span.dark)).toBe(true);
  });

  for (const [theme, well, variant] of [
    ["default-dark", SYNTAX_WELLS.dark, "dark"],
    ["default-light", SYNTAX_WELLS.light, "light"],
  ] as const) {
    it(`${theme}: every token reads on the well (>= ${SYNTAX_MIN_CONTRAST}:1)`, async () => {
      for (const [language, text] of FIXTURES) {
        const spans = (await highlightLines(text, language)).flat();
        for (const span of spans) {
          const ratio = contrastRatio(span[variant], well);
          expect(
            ratio,
            `${language} ${span[variant]} on ${theme} well measured ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(SYNTAX_MIN_CONTRAST);
        }
      }
    });
  }

  it("checks contrast against the same wells the app draws (surface-sunken)", () => {
    // The worker cannot read CSS, so it carries the two wells. If a token value
    // moves, this is the test that says so.
    expect(SYNTAX_WELLS.dark).toBe(DEFAULT_DARK_TOKENS["surface-sunken"]);
    expect(SYNTAX_WELLS.light).toBe(DEFAULT_LIGHT_TOKENS["surface-sunken"]);
  });

  it("still returns [] for an unknown language or empty text", async () => {
    await expect(highlightLines("x", "not-a-language")).resolves.toEqual([]);
    await expect(highlightLines("", "typescript")).resolves.toEqual([]);
    await expect(highlightLines("x", "")).resolves.toEqual([]);
  });
});
