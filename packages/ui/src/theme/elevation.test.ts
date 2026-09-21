import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DARK_TOKENS,
  DEFAULT_LIGHT_TOKENS,
  SEMANTIC_TOKEN_KEYS,
  SEMANTIC_TOKEN_TO_CSS_VAR,
  type SemanticTokenKey,
} from "../tokens/manifest";

// CIE L* (perceptual lightness, 0-100) of an opaque #rrggbb color.
function lightness(hex: string): number {
  const channel = (offset: number) => {
    const s = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const y = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return y > 216 / 24389 ? 116 * y ** (1 / 3) - 16 : (y * 24389) / 27;
}

type Surface = SemanticTokenKey;

interface Adjacency {
  above: Surface;
  below: Surface;
  minGap: number;
  where: string;
}

// The pairs of surfaces that physically abut (or stack) in the app. Depth is
// carried by tone alone (DESIGN.md forbids ambient shadows), so each of these
// must clear a perceptual gap — otherwise the planes read as one flat color.
const SHELL_PLANES: Adjacency[] = [
  {
    above: "surface-rail",
    below: "surface-panel",
    minGap: 1.5,
    where: "rail | sessions column",
  },
  {
    above: "surface-panel",
    below: "canvas",
    minGap: 1.5,
    where: "sessions column | stage",
  },
  {
    above: "surface-rail",
    below: "canvas",
    minGap: 3.0,
    where: "titlebar/rail | stage",
  },
];

const STACKED_SURFACES: Adjacency[] = [
  {
    above: "surface-card",
    below: "canvas",
    minGap: 2.5,
    where: "workspace card on stage",
  },
  {
    above: "surface-card-hover",
    below: "surface-card",
    minGap: 1.5,
    where: "card hover",
  },
  {
    above: "surface-elevated",
    below: "surface-rail",
    minGap: 2.0,
    where: "active tab on titlebar",
  },
  {
    above: "surface-elevated",
    below: "canvas",
    minGap: 4.0,
    where: "prompt card on stage",
  },
  {
    above: "surface-elevated",
    below: "surface-card",
    minGap: 2.0,
    where: "popover on card",
  },
  {
    above: "surface-nested",
    below: "canvas",
    minGap: 1.0,
    where: "tool accordion on stage",
  },
  {
    above: "canvas",
    below: "surface-sunken",
    minGap: 1.0,
    where: "terminal well in stage",
  },
];

// Light themes cannot exceed white, so the top of the ramp is white for every
// raised surface and separation there is the border's job. Dark themes can, and
// must, keep Level 4 above Level 3 (DESIGN.md Elevation & Depth).
const DARK_ONLY: Adjacency[] = [
  {
    above: "surface-overlay",
    below: "surface-elevated",
    minGap: 2.5,
    where: "palette over drawer",
  },
];

// Light recesses by darkening, so the recessed planes are *below* their parent
// rather than above it. Sunken is the one recess that holds in both themes.
//
// Not asserted here, by design: rail, elevated, card and overlay are all
// #ffffff in Default Light, so pairs made only of those (popover on card, palette
// over drawer, active tab on titlebar) have no tonal gap to measure. Their
// separation is the 1px `hairline-strong` border, which contrast.test.ts holds
// at >= 1.4:1 on each of them.
const LIGHT_ONLY: Adjacency[] = [
  {
    above: "canvas",
    below: "surface-sunken",
    minGap: 1.0,
    where: "terminal well in stage (light)",
  },
  {
    above: "surface-elevated",
    below: "canvas",
    minGap: 3.0,
    where: "prompt card on stage (light)",
  },
  {
    above: "surface-card",
    below: "surface-card-hover",
    minGap: 1.5,
    where: "card hover darkens (light)",
  },
  {
    above: "surface-panel",
    below: "surface-nested",
    minGap: 1.0,
    where: "tool accordion body inside a panel (light)",
  },
];

function gap(
  tokens: Record<SemanticTokenKey, string>,
  pair: Adjacency,
): number {
  return lightness(tokens[pair.above]) - lightness(tokens[pair.below]);
}

describe("Elevation ramp", () => {
  const cases: [string, Record<SemanticTokenKey, string>, Adjacency[]][] = [
    [
      "dark",
      DEFAULT_DARK_TOKENS,
      [...SHELL_PLANES, ...STACKED_SURFACES, ...DARK_ONLY],
    ],
    // Light recesses by darkening, so hover/nested steps invert: they are
    // asserted the right way round in LIGHT_ONLY instead of reusing the dark
    // pairs. The shell cascade, card-on-stage and the sunken well hold in both.
    [
      "light",
      DEFAULT_LIGHT_TOKENS,
      [...SHELL_PLANES, STACKED_SURFACES[0], ...LIGHT_ONLY],
    ],
  ];

  for (const [name, tokens, pairs] of cases) {
    describe(`${name} theme`, () => {
      for (const pair of pairs) {
        it(`${pair.where}: ${pair.above} clears ${pair.below} by >= ${pair.minGap} L*`, () => {
          expect(gap(tokens, pair)).toBeGreaterThanOrEqual(pair.minGap);
        });
      }
    });
  }

  it("chrome is raised above the stage in both themes", () => {
    expect(lightness(DEFAULT_DARK_TOKENS["surface-rail"])).toBeGreaterThan(
      lightness(DEFAULT_DARK_TOKENS.canvas),
    );
    expect(lightness(DEFAULT_LIGHT_TOKENS["surface-rail"])).toBeGreaterThan(
      lightness(DEFAULT_LIGHT_TOKENS.canvas),
    );
  });

  it("region dividers are visibly heavier than component hairlines", () => {
    const alpha = (v: string) => Number.parseFloat(v.split(",")[3] ?? "1");
    expect(alpha(DEFAULT_DARK_TOKENS["hairline-structural"])).toBeGreaterThan(
      alpha(DEFAULT_DARK_TOKENS.hairline),
    );
    expect(alpha(DEFAULT_LIGHT_TOKENS["hairline-structural"])).toBeGreaterThan(
      alpha(DEFAULT_LIGHT_TOKENS.hairline),
    );
  });
});

describe("tokens.css and manifest.ts stay in sync", () => {
  const css = readFileSync(resolve(__dirname, "../tokens/tokens.css"), "utf-8");
  const boundary = css.indexOf('[data-theme="light"]');
  const blocks: [string, string, Record<SemanticTokenKey, string>][] = [
    ["dark", css.slice(0, boundary), DEFAULT_DARK_TOKENS],
    ["light", css.slice(boundary), DEFAULT_LIGHT_TOKENS],
  ];

  // 0.50 and 0.5 are the same alpha; only compare values, not formatting.
  const normalize = (v: string) =>
    v
      .replace(/\s+/g, "")
      .toLowerCase()
      .replace(/(\.\d*?)0+(?=[,)])/g, "$1")
      .replace(/\.(?=[,)])/g, "");

  for (const [name, block, tokens] of blocks) {
    it(`${name} literal values match the manifest`, () => {
      for (const key of SEMANTIC_TOKEN_KEYS) {
        const cssVar = SEMANTIC_TOKEN_TO_CSS_VAR[key];
        const match = block.match(new RegExp(`${cssVar}:\\s*([^;]+);`));
        expect(match, `${cssVar} missing from ${name} block`).not.toBeNull();
        const value = match?.[1] ?? "";
        // Aliases (var(--…)) resolve to another token; only literals compare.
        if (value.startsWith("var(")) continue;
        expect(normalize(value), `${cssVar} (${name})`).toBe(
          normalize(tokens[key]),
        );
      }
    });
  }
});
