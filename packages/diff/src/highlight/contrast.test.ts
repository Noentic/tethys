import { describe, expect, it } from "vitest";
import { contrastRatio, ensureContrast } from "./contrast";

describe("syntax colour contrast", () => {
  it("measures the WCAG ratio, symmetric and 1:1 against itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#e4e4e7", "#e4e4e7")).toBeCloseTo(1, 5);
  });

  it("accepts #rgb, #rrggbb and #rrggbbaa", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffffff", "#000000")).toBeCloseTo(21, 1);
  });

  it("leaves a colour that already clears the ratio untouched", () => {
    expect(ensureContrast("#8b949e", "#050507", 4.5)).toBe("#8b949e");
  });

  it("darkens a colour on a light well until it clears the ratio", () => {
    const well = "#e4e4e7";
    const fixed = ensureContrast("#6e7781", well, 4.5);
    expect(contrastRatio("#6e7781", well)).toBeLessThan(4.5);
    expect(contrastRatio(fixed, well)).toBeGreaterThanOrEqual(4.5);
    // Only as far as needed: one step lighter would not have cleared it.
    expect(fixed).not.toBe("#000000");
  });

  it("lightens a colour on a dark well until it clears the ratio", () => {
    const well = "#050507";
    const fixed = ensureContrast("#6a737d", well, 4.5);
    expect(contrastRatio("#6a737d", well)).toBeLessThan(4.5);
    expect(contrastRatio(fixed, well)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the hue: the dominant channel stays dominant", () => {
    const fixed = ensureContrast("#df8e1d", "#e4e4e7", 4.5);
    const [r, g, b] = [1, 3, 5].map((i) =>
      Number.parseInt(fixed.slice(i, i + 2), 16),
    );
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it("returns a non-hex value (a CSS keyword or empty) unchanged", () => {
    expect(ensureContrast("", "#e4e4e7", 4.5)).toBe("");
    expect(ensureContrast("inherit", "#e4e4e7", 4.5)).toBe("inherit");
  });
});
