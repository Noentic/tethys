import { describe, expect, it } from "vitest";
import { DEFAULT_DARK_TOKENS, DEFAULT_LIGHT_TOKENS } from "../tokens/manifest";

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(str: string): RGBA {
  const trimmed = str.trim();
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      return {
        r: Number.parseInt(hex[0] + hex[0], 16),
        g: Number.parseInt(hex[1] + hex[1], 16),
        b: Number.parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length === 6) {
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
  }
  const match = trimmed.match(
    /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/,
  );
  if (match) {
    return {
      r: Number.parseInt(match[1], 10),
      g: Number.parseInt(match[2], 10),
      b: Number.parseInt(match[3], 10),
      a: match[4] !== undefined ? Number.parseFloat(match[4]) : 1,
    };
  }
  throw new Error(`Unable to parse color: ${str}`);
}

function composite(foreground: RGBA, background: RGBA): RGBA {
  const a = foreground.a + background.a * (1 - foreground.a);
  const r = Math.round(
    (foreground.r * foreground.a +
      background.r * background.a * (1 - foreground.a)) /
      a,
  );
  const g = Math.round(
    (foreground.g * foreground.a +
      background.g * background.a * (1 - foreground.a)) /
      a,
  );
  const b = Math.round(
    (foreground.b * foreground.a +
      background.b * background.a * (1 - foreground.a)) /
      a,
  );
  return { r, g, b, a };
}

function getLuminance(rgba: RGBA): number {
  const [r, g, b] = [rgba.r, rgba.g, rgba.b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(
  colorA: string,
  colorB: string,
  baseBg = "#09090b",
): number {
  const bgBase = parseColor(baseBg);
  const parsedA = composite(parseColor(colorA), bgBase);
  const parsedB = composite(parseColor(colorB), bgBase);

  const lumA = getLuminance(parsedA);
  const lumB = getLuminance(parsedB);

  const brighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);

  return (brighter + 0.05) / (darker + 0.05);
}

describe("WCAG Contrast Gate (D6 / U8)", () => {
  describe("Default Dark Theme", () => {
    const dark = DEFAULT_DARK_TOKENS;
    const canvas = dark.canvas;

    it("text-primary on canvas passes WCAG AAA/AA (>= 4.5:1)", () => {
      const ratio = getContrastRatio(dark["text-primary"], canvas, canvas);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("text-secondary on canvas passes WCAG AA (>= 4.5:1)", () => {
      const ratio = getContrastRatio(dark["text-secondary"], canvas, canvas);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("text-primary on surface-card passes WCAG AA (>= 4.5:1)", () => {
      const ratio = getContrastRatio(
        dark["text-primary"],
        dark["surface-card"],
        canvas,
      );
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("text-primary on surface-elevated passes WCAG AA (>= 4.5:1)", () => {
      const ratio = getContrastRatio(
        dark["text-primary"],
        dark["surface-elevated"],
        canvas,
      );
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("primary on on-primary passes WCAG AAA/AA (>= 4.5:1)", () => {
      const ratio = getContrastRatio(dark.primary, dark["on-primary"], canvas);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("accent-focus on canvas passes UI/focus boundary contrast (>= 3:1)", () => {
      const ratio = getContrastRatio(dark["accent-focus"], canvas, canvas);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });

    it("accent-agent-active on canvas passes status contrast (>= 3:1)", () => {
      const ratio = getContrastRatio(
        dark["accent-agent-active"],
        canvas,
        canvas,
      );
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });

    it("status-danger on canvas passes status contrast (>= 3:1)", () => {
      const ratio = getContrastRatio(dark["status-danger"], canvas, canvas);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });

    it("status-success on canvas passes status contrast (>= 3:1)", () => {
      const ratio = getContrastRatio(dark["status-success"], canvas, canvas);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });
  });

  describe("Diff tokens on surface-sunken", () => {
    // `diff-viewer` always sits on `surface-sunken`, so both tokens are
    // evaluated against that well — dark obsidian in dark, slate in light —
    // not against the canvas. That is why the light theme needs its own,
    // deeper pair rather than reusing the bright dark values.
    for (const [themeName, tokens] of [
      ["default-dark", DEFAULT_DARK_TOKENS],
      ["default-light", DEFAULT_LIGHT_TOKENS],
    ] as const) {
      const sunken = tokens["surface-sunken"];
      it(`${themeName}: diff-added on surface-sunken passes (>= 4.5:1)`, () => {
        const ratio = getContrastRatio(tokens["diff-added"], sunken, sunken);
        expect(
          ratio,
          `diff-added on ${themeName} surface-sunken measured ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      });

      it(`${themeName}: diff-removed on surface-sunken passes (>= 4.5:1)`, () => {
        const ratio = getContrastRatio(tokens["diff-removed"], sunken, sunken);
        expect(
          ratio,
          `diff-removed on ${themeName} surface-sunken measured ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  });

  describe("Default Light Theme", () => {
    const light = DEFAULT_LIGHT_TOKENS;
    const canvas = light.canvas;

    it("text-primary on canvas passes WCAG AAA/AA (>= 4.5:1)", () => {
      const ratio = getContrastRatio(light["text-primary"], canvas, canvas);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("text-secondary on canvas passes WCAG AA (>= 4.5:1)", () => {
      const ratio = getContrastRatio(light["text-secondary"], canvas, canvas);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("text-primary on surface-card passes WCAG AA (>= 4.5:1)", () => {
      const ratio = getContrastRatio(
        light["text-primary"],
        light["surface-card"],
        canvas,
      );
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("text-primary on surface-elevated passes WCAG AA (>= 4.5:1)", () => {
      const ratio = getContrastRatio(
        light["text-primary"],
        light["surface-elevated"],
        canvas,
      );
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("primary on on-primary passes WCAG AAA/AA (>= 4.5:1)", () => {
      const ratio = getContrastRatio(
        light.primary,
        light["on-primary"],
        canvas,
      );
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("accent-focus on canvas passes UI/focus boundary contrast (>= 3:1)", () => {
      const ratio = getContrastRatio(light["accent-focus"], canvas, canvas);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });

    it("accent-agent-active on canvas passes status contrast (>= 3:1)", () => {
      const ratio = getContrastRatio(
        light["accent-agent-active"],
        canvas,
        canvas,
      );
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });

    it("status-danger on canvas passes status contrast (>= 3:1)", () => {
      const ratio = getContrastRatio(light["status-danger"], canvas, canvas);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });

    it("status-success on canvas passes status contrast (>= 3:1)", () => {
      const ratio = getContrastRatio(light["status-success"], canvas, canvas);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });
  });

  describe("State colour, two tiers (d0-rc9)", () => {
    // Marker/text tier. These are read as labels — a `state-badge`, the word
    // `Failed`, a `+N` stat, a 2px rule — so every pair must clear 4.5:1 on
    // every surface of its own theme, not only on the canvas. Default Light's
    // previous tones measured 2.9:1 (amber), 3.4:1 (green) and 3.7:1 (cyan) and
    // failed; that is why the light tones are deep and the softening lives in
    // the surface tier rather than in the hue.
    const surfaces = [
      "canvas",
      "surface-rail",
      "surface-panel",
      "surface-card",
      "surface-card-hover",
      "surface-nested",
      "surface-elevated",
      "surface-overlay",
    ] as const;
    const markerTier = [
      "status-success",
      "status-warning",
      "status-danger",
      "accent-agent-active",
      "diff-added",
      "diff-removed",
    ] as const;
    const softTier = [
      "status-success-soft",
      "status-warning-soft",
      "status-danger-soft",
    ] as const;

    for (const [themeName, tokens] of [
      ["default-dark", DEFAULT_DARK_TOKENS],
      ["default-light", DEFAULT_LIGHT_TOKENS],
    ] as const) {
      for (const key of markerTier) {
        it(`${themeName}: ${key} reads as text on every surface (>= 4.5:1)`, () => {
          for (const surface of surfaces) {
            const host = tokens[surface];
            const ratio = getContrastRatio(tokens[key], host, host);
            expect(
              ratio,
              `${key} on ${surface} measured ${ratio.toFixed(2)}:1`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        });
      }

      it(`${themeName}: the attention left rule clears non-text contrast on a card (>= 3:1)`, () => {
        const card = tokens["surface-card"];
        for (const key of ["status-warning", "status-danger"] as const) {
          const ratio = getContrastRatio(tokens[key], card, card);
          expect(
            ratio,
            `${key} rule on surface-card measured ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(3.0);
        }
      });

      for (const key of softTier) {
        it(`${themeName}: ${key} is a wash, not a second saturated colour`, () => {
          const card = tokens["surface-card"];
          const ratio = getContrastRatio(tokens[key], card, card);
          // Present (> 1) but quiet (< 1.6): a tint the eye reads as "this row
          // is in that state", not a filled block competing with the text.
          expect(
            ratio,
            `${key} tint measured ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThan(1.05);
          expect(
            ratio,
            `${key} tint measured ${ratio.toFixed(2)}:1`,
          ).toBeLessThan(1.6);
        });
      }
    }
  });
});
