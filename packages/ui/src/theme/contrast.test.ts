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
    // `diff-viewer` always sits on `surface-sunken`, which is dark in both
    // themes, so both tokens are evaluated against that well, not the canvas.
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
});
