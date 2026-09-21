import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Source-level gate. The design system only stays unified if nothing can route
// around it, so these fail the build on the patterns that caused drift:
// raw palette colors, raw color literals, shadows, off-scale type, ungated
// motion, and references to tokens that don't exist (which silently render as
// "no color"). It scans every workspace package and app, not only the design
// system's own: the leaks it exists to catch are in the features.

const REPO_ROOT = resolve(__dirname, "../../../..");

interface SourceFile {
  file: string;
  text: string;
}

function workspaceSourceRoots(): string[] {
  return ["packages", "apps"].flatMap((group) => {
    const groupDir = join(REPO_ROOT, group);
    return readdirSync(groupDir)
      .map((name) => join(groupDir, name, "src"))
      .filter((dir) => existsSync(dir));
  });
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(tsx?|css)$/.test(e.name))
    .map((e) => join(e.parentPath, e.name))
    .filter((f) => !/\.test\.tsx?$/.test(f))
    .filter((f) => !f.includes("node_modules"));
}

const FILES: SourceFile[] = workspaceSourceRoots()
  .flatMap(sourceFiles)
  .map((file) => ({
    file: relative(REPO_ROOT, file),
    text: readFileSync(file, "utf-8"),
  }));

function findAll(pattern: RegExp, files: SourceFile[] = FILES): string[] {
  const hits: string[] = [];
  for (const { file, text } of files) {
    text.split("\n").forEach((line, i) => {
      for (const match of line.matchAll(pattern)) {
        hits.push(`${file}:${i + 1}  ${match[0]}`);
      }
    });
  }
  return hits;
}

// A colour literal in component source is a value the theme cannot change.
const RAW_COLOR =
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?|oklch|oklab)\(/g;

// The files that may hold a colour literal, each with the reason. An entry that
// stops matching is itself a failure, so this list cannot outlive its cause.
const RAW_COLOR_ALLOWLIST: Record<string, string> = {
  "packages/ui/src/tokens/tokens.css":
    "the themes' own values: the one place a colour is defined",
  "packages/ui/src/tokens/manifest.ts":
    "the same values as data, for theme validation and hot-swap",
  "packages/terminal/src/xterm-surface.tsx":
    "xterm paints its own canvas and needs a value before the CSS variables can be read; a fallback pair equal to the dark well",
  "packages/diff/src/highlight/shiki.ts":
    "the two surface-sunken values the syntax palette is contrast-checked against; the worker cannot read CSS and importing @tethys/ui would bundle React into it, so shiki.test.ts asserts they equal the tokens",
  "apps/desktop/src/routes/benchmark.tsx":
    "S0.1 spike harness, development builds only (route-tree.test.tsx)",
};

function findRawColors(
  files: SourceFile[],
  allowlist: Record<string, string>,
): string[] {
  return findAll(
    RAW_COLOR,
    files.filter(({ file }) => !(file in allowlist)),
  );
}

function findStaleAllowlistEntries(
  files: SourceFile[],
  allowlist: Record<string, string>,
  pattern: RegExp = RAW_COLOR,
): string[] {
  return Object.keys(allowlist).filter((entry) => {
    const source = files.find(({ file }) => file === entry);
    return !source || findAll(pattern, [source]).length === 0;
  });
}

// The stacking scale orders whole surfaces (drawer, dialog, popover...). Local
// layering inside one scroll container is a different thing, so it may say why.
const Z_INDEX_STYLE = /\bzIndex\b/g;
const Z_INDEX_ALLOWLIST: Record<string, string> = {
  "packages/features/src/sync/sync-grid.tsx":
    "sticky frozen column and header layered inside the grid's own scroll container; deprecated in d0-rc6 and removed with the MCP editor",
};

function withoutAllowlisted(allowlist: Record<string, string>): SourceFile[] {
  return FILES.filter(({ file }) => !(file in allowlist));
}

// State colour never paints a full perimeter around a content surface (DESIGN.md
// State colour). A 2px left rule (`border-l-(...)`) is the permitted form, and
// it does not match this pattern. A compact control is the exception: on a chip,
// pill, badge, destructive button or errored input the border *is* the shape.
const STATE_PERIMETER =
  /(?<![\w-])border-(?:\(--tethys-status-[\w-]+\)|warning-soft|status-[\w-]+)/g;
const STATE_PERIMETER_ALLOWLIST: Record<string, string> = {
  "packages/ui/src/components/badge.tsx":
    "a <=20px badge: the outline is the badge's shape",
  "packages/ui/src/components/approval-inbox-pill.tsx":
    "a 20px pill: the outline is the pill's shape",
  "packages/ui/src/components/button.tsx":
    "the `destructive` button: DESIGN.md exempts it by name",
  "packages/ui/src/components/stop-control.tsx":
    "`stop-control.graceElapsed`: a compact control in its destructive state",
  "packages/ui/src/components/textarea.tsx":
    "an input in validation failure: DESIGN.md exempts it by name",
  "packages/features/src/workspaces/session-item-chip.tsx":
    "a <=28px chip: `session-item-chip.pendingBorder`",
  "packages/features/src/inspector/renderers/jump-to-latest.tsx":
    "the 6px ring of the pending-request dot, not a surface",
};

// Every looping animation must sit behind `motion-safe:` so that
// prefers-reduced-motion suspends it (DESIGN.md motion.reducedMotion).
const UNGATED_ANIMATION =
  /(?<!motion-safe:)(?<![\w-])animate-(?!none\b)[\w-]+/g;

function findUngatedMotion(files: SourceFile[]): string[] {
  return findAll(UNGATED_ANIMATION, files);
}

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

describe("token discipline", () => {
  it("scans every package and app, not only the design system", () => {
    expect(FILES.length).toBeGreaterThan(150);
    for (const prefix of [
      "packages/ui/src/",
      "packages/features/src/",
      "packages/diff/src/",
      "packages/terminal/src/",
      "packages/composer/src/",
      "apps/desktop/src/",
    ]) {
      expect(
        FILES.some(({ file }) => file.startsWith(prefix)),
        `${prefix} is scanned`,
      ).toBe(true);
    }
  });

  it("holds no colour literal outside the reasoned allowlist", () => {
    expect(findRawColors(FILES, RAW_COLOR_ALLOWLIST)).toEqual([]);
  });

  it("keeps the colour allowlist honest: every entry still needs its exemption", () => {
    expect(findStaleAllowlistEntries(FILES, RAW_COLOR_ALLOWLIST)).toEqual([]);
    for (const [file, reason] of Object.entries(RAW_COLOR_ALLOWLIST)) {
      expect(reason.length, `${file} needs a reason`).toBeGreaterThan(20);
    }
  });

  it("reports a colour literal with its file and line", () => {
    const files = [
      {
        file: "packages/x/src/panel.tsx",
        text: "const a = 1;\nconst c = '#ff0000';\nconst d = 'rgba(0, 0, 0, 0.5)';\n",
      },
    ];
    expect(findRawColors(files, {})).toEqual([
      "packages/x/src/panel.tsx:2  #ff0000",
      "packages/x/src/panel.tsx:3  rgba(",
    ]);
  });

  it("ignores an allowlisted file and reports a stale or missing entry", () => {
    const files = [
      { file: "packages/x/src/theme.ts", text: "export const c = '#123456';" },
      { file: "packages/x/src/clean.ts", text: "export const n = 1;" },
    ];
    const allowlist = {
      "packages/x/src/theme.ts": "a theme literal, on purpose",
      "packages/x/src/clean.ts": "used to hold a literal",
      "packages/x/src/gone.ts": "the file was deleted",
    };
    expect(findRawColors(files, allowlist)).toEqual([]);
    expect(findStaleAllowlistEntries(files, allowlist)).toEqual([
      "packages/x/src/clean.ts",
      "packages/x/src/gone.ts",
    ]);
  });

  it("paints no state-colour perimeter on a content surface", () => {
    expect(
      findAll(STATE_PERIMETER, withoutAllowlisted(STATE_PERIMETER_ALLOWLIST)),
    ).toEqual([]);
  });

  it("keeps the compact-control allowlist honest", () => {
    expect(
      findStaleAllowlistEntries(
        FILES,
        STATE_PERIMETER_ALLOWLIST,
        STATE_PERIMETER,
      ),
    ).toEqual([]);
  });

  it("reports a full state perimeter and accepts a left rule", () => {
    const at = (text: string) => [{ file: "packages/x/src/card.tsx", text }];
    expect(
      findAll(STATE_PERIMETER, at('className="border border-warning-soft"')),
    ).toEqual(["packages/x/src/card.tsx:1  border-warning-soft"]);
    expect(
      findAll(
        STATE_PERIMETER,
        at('className="rounded-md border-(--tethys-status-danger) p-md"'),
      ),
    ).toEqual(["packages/x/src/card.tsx:1  border-(--tethys-status-danger)"]);
    expect(
      findAll(
        STATE_PERIMETER,
        at('className="border-l-2 border-l-(--tethys-status-warning)"'),
      ),
    ).toEqual([]);
  });

  it("scans every package that draws UI for Tailwind utilities", () => {
    // Tailwind generates only the utilities it scans. A class used only in
    // features, diff, terminal... is silently absent from a production build
    // unless its package is an `@source` of the stylesheet the app imports.
    const css = readFileSync(
      join(REPO_ROOT, "packages/ui/tailwind.css"),
      "utf-8",
    );
    const sources = [...css.matchAll(/@source\s+"([^"]+)"/g)].map((m) => m[1]);
    const packagesWithComponents = [
      ...new Set(
        FILES.filter(({ file }) => file.endsWith(".tsx"))
          .map(({ file }) => file.match(/^packages\/([^/]+)\/src\//)?.[1])
          .filter(
            (name): name is string => name !== undefined && name !== "ui",
          ),
      ),
    ];
    expect(packagesWithComponents.length).toBeGreaterThan(0);
    for (const name of packagesWithComponents) {
      expect(sources, `packages/${name} needs an @source`).toContain(
        `../${name}/src`,
      );
    }
    expect(sources).toContain("./src");
  });

  it("gates every looping animation behind motion-safe", () => {
    expect(findUngatedMotion(FILES)).toEqual([]);
  });

  it("reports animate-* without motion-safe, and accepts the gated forms", () => {
    const at = (text: string) => [{ file: "packages/x/src/a.tsx", text }];
    expect(findUngatedMotion(at('className="animate-spin"'))).toEqual([
      "packages/x/src/a.tsx:1  animate-spin",
    ]);
    expect(
      findUngatedMotion(at('className="motion-safe:animate-spin"')),
    ).toEqual([]);
    expect(
      findUngatedMotion(at('className="hover:motion-safe:animate-breathe"')),
    ).toEqual([]);
    expect(findUngatedMotion(at('className="animate-none"'))).toEqual([]);
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
    expect(
      findAll(Z_INDEX_STYLE, withoutAllowlisted(Z_INDEX_ALLOWLIST)),
    ).toEqual([]);
  });

  it("keeps the z-index allowlist honest", () => {
    expect(
      findStaleAllowlistEntries(FILES, Z_INDEX_ALLOWLIST, Z_INDEX_STYLE),
    ).toEqual([]);
  });
});
