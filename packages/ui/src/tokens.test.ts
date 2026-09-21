import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
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

interface DesignContract {
  primitives: Record<string, string>;
  themes: Record<string, Record<string, string>>;
  semantic: Record<string, { var: string; role: string }>;
}

// DESIGN.md is the contract, so the expected names, CSS variables and default
// theme values are read from its YAML front matter instead of being copied
// here, where they could drift without a red test.
function readDesignContract(): DesignContract {
  const source = readFileSync(
    resolve(__dirname, "../../../DESIGN.md"),
    "utf-8",
  );
  const front = source.split(/^---\s*$/m)[1];
  return parse(front) as DesignContract;
}

// A theme value is a literal or a `{primitives.name}` reference.
function resolveDesignValue(value: string, contract: DesignContract): string {
  const ref = value.match(/^\{primitives\.([\w-]+)\}$/);
  if (!ref) return value;
  const primitive = contract.primitives[ref[1]];
  if (primitive === undefined) {
    throw new Error(`DESIGN.md references unknown primitive ${ref[1]}`);
  }
  return primitive;
}

// 0.50 and 0.5 are the same alpha; only compare values, not formatting.
const normalizeColor = (v: string) =>
  v
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/(\.\d*?)0+(?=[,)])/g, "$1")
    .replace(/\.(?=[,)])/g, "");

describe("Semantic Tokens Parity (U1 / D1)", () => {
  const contract = readDesignContract();
  const designNames = Object.keys(contract.semantic);

  it("manifest contains every DESIGN.md semantic token name", () => {
    expect(new Set<string>(SEMANTIC_TOKEN_KEYS)).toEqual(new Set(designNames));
    expect(SEMANTIC_TOKEN_KEYS.length).toBe(designNames.length);
  });

  it("every semantic token maps to the CSS variable DESIGN.md names", () => {
    for (const name of designNames) {
      expect(
        SEMANTIC_TOKEN_TO_CSS_VAR[name as SemanticTokenKey],
        `CSS var for ${name}`,
      ).toBe(contract.semantic[name].var);
    }
  });

  for (const [themeId, tokens] of [
    ["default-dark", DEFAULT_DARK_TOKENS],
    ["default-light", DEFAULT_LIGHT_TOKENS],
  ] as const) {
    it(`${themeId} values equal the DESIGN.md theme after primitives resolve`, () => {
      const theme = contract.themes[themeId];
      expect(Object.keys(theme).sort(), `${themeId} keys`).toEqual(
        [...designNames].sort(),
      );
      for (const name of designNames) {
        const expected = resolveDesignValue(theme[name], contract);
        expect(
          normalizeColor(tokens[name as SemanticTokenKey]),
          `${themeId} ${name}`,
        ).toBe(normalizeColor(expected));
      }
    });
  }

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

  it("validateThemeManifest accepts a dark well on a light base via the on-sunken family", () => {
    const res = validateThemeManifest({
      id: "paper-with-terminal",
      name: "Paper With Terminal",
      base: "default-light",
      vars: {
        "surface-sunken": "#0b0b0d",
        "text-on-sunken": "#f4f4f5",
        "text-on-sunken-secondary": "#bfbfc9",
        "text-on-sunken-muted": "#8e8e98",
        "hairline-on-sunken": "rgba(255, 255, 255, 0.10)",
        "wash-on-sunken": "rgba(255, 255, 255, 0.05)",
      },
    });
    expect(res.success).toBe(true);
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

  it("diff tokens deepen in the light theme so they read on the slate well", () => {
    expect(DEFAULT_DARK_TOKENS["diff-added"]).toBe("#5bcc80");
    expect(DEFAULT_LIGHT_TOKENS["diff-added"]).toBe("#046c4e");
    expect(DEFAULT_DARK_TOKENS["diff-removed"]).toBe("#ff8a84");
    expect(DEFAULT_LIGHT_TOKENS["diff-removed"]).toBe("#b91c1c");
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

  it("no longer defines the layout variables of regions that do not exist", () => {
    // The 56px action bar was retired into the prompt card; there is no Hub
    // column and no docked Sessions strip (DESIGN.md Shell Structure).
    const css = readFileSync(resolve(__dirname, "tokens/tokens.css"), "utf-8");
    for (const retired of [
      "--layout-shell-actionbar",
      "--layout-shell-left",
      "--layout-shell-left-collapsed",
    ]) {
      expect(css, retired).not.toContain(`${retired}:`);
    }
    // What the shell still lays out with.
    for (const kept of [
      "--layout-shell-threads",
      "--layout-shell-inspector",
      "--layout-prompt-width",
    ]) {
      expect(css, kept).toContain(`${kept}:`);
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
