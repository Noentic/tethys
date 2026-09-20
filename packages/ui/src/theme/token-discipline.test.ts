import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Source-level gate. The design system only stays unified if nothing can route
// around it, so these fail the build on the patterns that caused drift:
// raw palette colors, shadows, off-scale type, and references to tokens that
// don't exist (which silently render as "no color").

const REPO_ROOT = resolve(__dirname, "../../../..");
const SCAN_ROOTS = ["packages/ui/src", "apps/desktop/src"].map((p) =>
  join(REPO_ROOT, p),
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(tsx?|css)$/.test(e.name))
    .map((e) => join(e.parentPath, e.name))
    .filter((f) => !/\.test\.tsx?$/.test(f))
    .filter((f) => !f.includes("node_modules"));
}

const FILES = SCAN_ROOTS.flatMap(sourceFiles).map((file) => ({
  file: relative(REPO_ROOT, file),
  text: readFileSync(file, "utf-8"),
}));

function findAll(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const { file, text } of FILES) {
    text.split("\n").forEach((line, i) => {
      for (const match of line.matchAll(pattern)) {
        hits.push(`${file}:${i + 1}  ${match[0]}`);
      }
    });
  }
  return hits;
}

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

describe("token discipline", () => {
  it("scans real source", () => {
    expect(FILES.length).toBeGreaterThan(40);
  });

  it("uses no raw palette colors (use --tethys-* semantic tokens)", () => {
    const utilities =
      "bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|caret";
    expect(
      findAll(
        new RegExp(
          `\\b(?:${utilities})-(?:${PALETTE})-\\d{2,3}(?:/\\d+)?\\b`,
          "g",
        ),
      ),
    ).toEqual([]);
    expect(
      findAll(
        new RegExp(`\\b(?:${utilities})-(?:white|black)(?:/\\d+)?\\b`, "g"),
      ),
    ).toEqual([]);
  });

  it("uses no shadows (depth is tone + hairline; see DESIGN.md Elevation & Depth)", () => {
    expect(
      findAll(/(?<![\w-])(?:drop-)?shadow-(?!none\b)[\w[\]/.-]+/g),
    ).toEqual([]);
  });

  it("sets type through the scale, not arbitrary or default sizes", () => {
    expect(findAll(/\btext-\[\d+(?:\.\d+)?(?:px|rem|em)\]/g)).toEqual([]);
    expect(findAll(/(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g)).toEqual(
      [],
    );
  });

  it("sizes boxes with numbers or arbitrary values, never t-shirt names", () => {
    // tailwind.css defines --spacing-xs..2xl (DESIGN.md spacing). Tailwind v4 looks
    // up max-w-lg / w-md / etc. in --spacing before --container, so those names
    // now mean 4-32px instead of 20-42rem. Use max-w-128, w-96, or a layout token.
    expect(
      findAll(
        /(?<![\w-])(?:max-w|min-w|w|max-h|min-h|h|size|basis)-(?:xs|sm|md|lg|xl|2xl)\b/g,
      ),
    ).toEqual([]);
  });

  it("uses only the 400/500/600 weights the type scale defines", () => {
    expect(
      findAll(
        /(?<![\w-])font-(?:thin|extralight|light|bold|extrabold|black)\b/g,
      ),
    ).toEqual([]);
  });

  it("references only --tethys-* variables that tokens.css defines", () => {
    const tokensCss = readFileSync(
      join(REPO_ROOT, "packages/ui/src/tokens/tokens.css"),
      "utf-8",
    );
    const defined = new Set(tokensCss.match(/--tethys-[a-z0-9-]+(?=\s*:)/g));
    expect(defined.size).toBeGreaterThan(30);

    const undefinedRefs: string[] = [];
    for (const { file, text } of FILES) {
      if (file.endsWith("tokens/tokens.css")) continue;
      text.split("\n").forEach((line, i) => {
        for (const m of line.matchAll(/--tethys-[a-z0-9-]+/g)) {
          if (!defined.has(m[0]))
            undefinedRefs.push(`${file}:${i + 1}  ${m[0]}`);
        }
      });
    }
    expect(undefinedRefs).toEqual([]);
  });

  it("derives paint order from the stacking tokens, never a literal z-index", () => {
    expect(findAll(/(?<![\w-])z-\d+\b/g)).toEqual([]);
    expect(findAll(/(?<![\w-])z-\[/g)).toEqual([]);
    expect(findAll(/\bzIndex\b/g)).toEqual([]);
  });
});
