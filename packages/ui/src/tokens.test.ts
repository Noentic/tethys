import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyTheme,
  DEFAULT_DARK_TOKENS,
  DEFAULT_LIGHT_TOKENS,
  resolveThemeVars,
  SEMANTIC_TOKEN_KEYS,
  SEMANTIC_TOKEN_TO_CSS_VAR,
  type SemanticTokenKey,
  STACKING_SCALE,
  STACKING_TOKEN_TO_CSS_VAR,
  validateThemeManifest,
} from "./tokens/manifest";

// List of all 33 semantic tokens defined in DESIGN.md `semantic:` block
const DESIGN_SEMANTIC_NAMES: SemanticTokenKey[] = [
  "canvas",
  "surface-rail",
  "surface-panel",
  "surface-elevated",
  "surface-card",
  "surface-card-hover",
  "surface-nested",
  "surface-overlay",
  "surface-sunken",
  "surface-hover",
  "surface-active",
  "overlay-scrim",
  "hairline",
  "hairline-strong",
  "hairline-structural",
  "edge-highlight",
  "grid-dot",
  "text-primary",
  "text-secondary",
  "text-muted",
  "text-inverse",
  "primary",
  "on-primary",
  "accent-focus",
  "accent-toggle-active",
  "accent-agent-active",
  "accent-agent-idle",
  "status-active-session",
  "status-success",
  "status-warning",
  "status-danger",
  "diff-added",
  "diff-removed",
];

describe("Semantic Tokens Parity (U1 / D1)", () => {
  it("manifest contains every DESIGN.md semantic token name", () => {
    expect(new Set(SEMANTIC_TOKEN_KEYS)).toEqual(
      new Set(DESIGN_SEMANTIC_NAMES),
    );
    expect(SEMANTIC_TOKEN_KEYS.length).toBe(DESIGN_SEMANTIC_NAMES.length);
  });

  it("manifest key set matches CSS vars defined in tokens.css for :root and [data-theme='light']", () => {
    const cssPath = resolve(__dirname, "tokens/tokens.css");
    const cssContent = readFileSync(cssPath, "utf-8");

    // Extract all --tethys-* property names from tokens.css
    const cssVarMatches = cssContent.match(/--tethys-[\w-]+(?=:)/g) ?? [];
    const uniqueCssVars = new Set(cssVarMatches);

    // Each semantic token's CSS var should exist in tokens.css
    for (const key of SEMANTIC_TOKEN_KEYS) {
      const expectedVar = SEMANTIC_TOKEN_TO_CSS_VAR[key];
      expect(
        uniqueCssVars.has(expectedVar),
        `Missing CSS var ${expectedVar} for semantic token ${key} in tokens.css`,
      ).toBe(true);
    }
  });

  it("default dark and light tokens cover all semantic keys", () => {
    for (const key of SEMANTIC_TOKEN_KEYS) {
      expect(DEFAULT_DARK_TOKENS[key]).toBeDefined();
      expect(DEFAULT_LIGHT_TOKENS[key]).toBeDefined();
    }
  });

  it("validateThemeManifest accepts valid custom theme manifests", () => {
    const validManifest = {
      id: "acme-sand",
      name: "Acme Sand",
      base: "default-dark",
      vars: {
        canvas: "#0c0a09",
        hairline: "rgba(255,255,255,0.10)",
      },
      meta: {
        author: "acme",
        version: "1.0.0",
      },
    };

    const res = validateThemeManifest(validManifest);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.id).toBe("acme-sand");
      expect(res.data.vars.canvas).toBe("#0c0a09");
    }
  });

  it("validateThemeManifest rejects unknown semantic keys", () => {
    const invalidManifest = {
      id: "invalid-theme",
      name: "Invalid Theme",
      base: "default-dark",
      vars: {
        "non-existent-token": "#ff0000",
      },
    };

    const res = validateThemeManifest(invalidManifest);
    expect(res.success).toBe(false);
  });

  it("validateThemeManifest rejects invalid base", () => {
    const invalidManifest = {
      id: "invalid-base",
      name: "Invalid Base",
      base: "solarized",
      vars: {},
    };

    const res = validateThemeManifest(invalidManifest);
    expect(res.success).toBe(false);
  });

  it("resolveThemeVars inherits missing keys from base theme", () => {
    const customTheme = {
      id: "custom-blue",
      name: "Custom Blue",
      base: "default-dark" as const,
      vars: {
        canvas: "#000033",
      },
    };

    const resolved = resolveThemeVars(customTheme);
    expect(resolved["--tethys-canvas"]).toBe("#000033");
    // Inherited from default-dark
    expect(resolved["--tethys-surface-rail"]).toBe(
      DEFAULT_DARK_TOKENS["surface-rail"],
    );
    expect(resolved["--tethys-text-primary"]).toBe(
      DEFAULT_DARK_TOKENS["text-primary"],
    );
  });

  it("applyTheme hot-swaps attributes and properties on target element", () => {
    const element = document.createElement("div");

    // Apply default light
    applyTheme("default-light", element);
    expect(element.getAttribute("data-theme")).toBe("light");

    // Apply default dark
    applyTheme("default-dark", element);
    expect(element.hasAttribute("data-theme")).toBe(false);

    // Apply custom theme
    applyTheme(
      {
        id: "custom-theme",
        name: "Custom Theme",
        base: "default-light",
        vars: { canvas: "#123456" },
      },
      element,
    );
    expect(element.getAttribute("data-theme")).toBe("light");
    expect(element.style.getPropertyValue("--tethys-canvas")).toBe("#123456");
  });
});

describe("Diff tokens and stacking (M1.6c U7 / U11)", () => {
  it("diff-added and diff-removed are known, validated theme keys", () => {
    const res = validateThemeManifest({
      id: "diff-only",
      name: "Diff Only",
      base: "default-light",
      vars: { "diff-added": "#00ff00" },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.vars["diff-added"]).toBe("#00ff00");
    }
  });

  it("both diff tokens carry the same bright value in both default themes", () => {
    expect(DEFAULT_DARK_TOKENS["diff-added"]).toBe("#10b981");
    expect(DEFAULT_LIGHT_TOKENS["diff-added"]).toBe("#10b981");
    expect(DEFAULT_DARK_TOKENS["diff-removed"]).toBe("#ef4444");
    expect(DEFAULT_LIGHT_TOKENS["diff-removed"]).toBe("#ef4444");
  });

  it("stacking scale equals the DESIGN.md stacking block, key for key", () => {
    const design = readFileSync(
      resolve(__dirname, "../../../DESIGN.md"),
      "utf-8",
    );
    const lines = design.split("\n");
    const start = lines.findIndex((line) => line.startsWith("stacking:"));
    expect(start, "DESIGN.md stacking block").toBeGreaterThanOrEqual(0);

    const parsed: Record<string, number> = {};
    for (let i = start + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.trim() === "" || !/^\s/.test(line)) break;
      const match = line.match(/^\s+([a-z0-9-]+):\s*(\d+)/);
      if (match) parsed[match[1]] = Number.parseInt(match[2], 10);
    }

    expect(parsed).toEqual({ ...STACKING_SCALE });
  });

  it("stacking order is drawer < dialog < sheet < palette < popover < toast < tooltip", () => {
    const order = [
      "drawer",
      "dialog",
      "sheet",
      "palette",
      "popover",
      "toast",
      "tooltip",
    ] as const;
    for (let i = 1; i < order.length; i += 1) {
      expect(STACKING_SCALE[order[i]]).toBeGreaterThan(
        STACKING_SCALE[order[i - 1]],
      );
    }
  });

  it("exports a CSS var per stacking tier, defined in tokens.css", () => {
    const css = readFileSync(resolve(__dirname, "tokens/tokens.css"), "utf-8");
    for (const [tier, cssVar] of Object.entries(STACKING_TOKEN_TO_CSS_VAR)) {
      expect(css, cssVar).toContain(`${cssVar}:`);
      expect(STACKING_SCALE).toHaveProperty(tier);
    }
  });
});
