/**
 * Contrast arithmetic for the syntax palette. The highlight worker cannot read
 * CSS, so it keeps the palette legible by construction: any token colour that
 * misses the ratio against its well is moved along its own hue until it clears
 * it. Pure and dependency-free, so it is safe inside the worker.
 */

type Rgb = [number, number, number];

function parseHex(color: string): Rgb | null {
  const hex = color.trim().replace(/^#/, "");
  const full =
    hex.length === 3 || hex.length === 4
      ? [...hex].map((c) => c + c).join("")
      : hex;
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(full)) {
    return null;
  }
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((c) => Math.round(c).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** WCAG contrast ratio of two opaque hex colours; alpha is ignored. */
export function contrastRatio(a: string, b: string): number {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (ra === null || rb === null) {
    return 1;
  }
  const [hi, lo] = [luminance(ra), luminance(rb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const STEP = 0.02;
const MAX_STEPS = 50;

/**
 * `color` if it already clears `min` against `well`; otherwise the nearest
 * colour on the line from `color` towards black (light well) or white (dark
 * well) that does. A value that is not a hex colour is returned unchanged.
 */
export function ensureContrast(
  color: string,
  well: string,
  min: number,
): string {
  const rgb = parseHex(color);
  const wellRgb = parseHex(well);
  if (rgb === null || wellRgb === null || contrastRatio(color, well) >= min) {
    return color;
  }
  const target = luminance(wellRgb) > 0.5 ? 0 : 255;
  for (let step = 1; step <= MAX_STEPS; step += 1) {
    const mixed = rgb.map((c) => c + (target - c) * STEP * step) as Rgb;
    const candidate = toHex(mixed);
    if (contrastRatio(candidate, well) >= min) {
      return candidate;
    }
  }
  return toHex([target, target, target]);
}
