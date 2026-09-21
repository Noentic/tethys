export const SEMANTIC_TOKEN_KEYS = [
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
  "status-success-soft",
  "status-warning-soft",
  "status-danger-soft",
  "status-interrupted",
  "status-suspended",
  "status-archived",
  "border-control",
  "text-on-sunken",
  "text-on-sunken-secondary",
  "text-on-sunken-muted",
  "hairline-on-sunken",
  "wash-on-sunken",
  "diff-added",
  "diff-removed",
] as const;

export type SemanticTokenKey = (typeof SEMANTIC_TOKEN_KEYS)[number];

export const SEMANTIC_TOKEN_TO_CSS_VAR: Record<SemanticTokenKey, string> = {
  canvas: "--tethys-canvas",
  "surface-rail": "--tethys-surface-rail",
  "surface-panel": "--tethys-surface-panel",
  "surface-elevated": "--tethys-surface-elevated",
  "surface-card": "--tethys-surface-card",
  "surface-card-hover": "--tethys-surface-card-hover",
  "surface-nested": "--tethys-surface-nested",
  "surface-overlay": "--tethys-surface-overlay",
  "surface-sunken": "--tethys-surface-sunken",
  "surface-hover": "--tethys-surface-hover",
  "surface-active": "--tethys-surface-active",
  "overlay-scrim": "--tethys-overlay-scrim",
  hairline: "--tethys-hairline",
  "hairline-strong": "--tethys-hairline-strong",
  "hairline-structural": "--tethys-hairline-structural",
  "edge-highlight": "--tethys-edge-highlight",
  "grid-dot": "--tethys-grid-dot",
  "text-primary": "--tethys-text-primary",
  "text-secondary": "--tethys-text-secondary",
  "text-muted": "--tethys-text-muted",
  "text-inverse": "--tethys-text-inverse",
  primary: "--tethys-primary",
  "on-primary": "--tethys-on-primary",
  "accent-focus": "--tethys-accent-focus",
  "accent-toggle-active": "--tethys-accent-toggle",
  "accent-agent-active": "--tethys-agent-active",
  "accent-agent-idle": "--tethys-agent-idle",
  "status-active-session": "--tethys-status-session",
  "status-success": "--tethys-status-success",
  "status-warning": "--tethys-status-warning",
  "status-danger": "--tethys-status-danger",
  "status-success-soft": "--tethys-status-success-soft",
  "status-warning-soft": "--tethys-status-warning-soft",
  "status-danger-soft": "--tethys-status-danger-soft",
  "status-interrupted": "--tethys-status-interrupted",
  "status-suspended": "--tethys-status-suspended",
  "status-archived": "--tethys-status-archived",
  "border-control": "--tethys-border-control",
  "text-on-sunken": "--tethys-text-on-sunken",
  "text-on-sunken-secondary": "--tethys-text-on-sunken-secondary",
  "text-on-sunken-muted": "--tethys-text-on-sunken-muted",
  "hairline-on-sunken": "--tethys-hairline-on-sunken",
  "wash-on-sunken": "--tethys-wash-on-sunken",
  "diff-added": "--tethys-diff-added",
  "diff-removed": "--tethys-diff-removed",
};

export const DEFAULT_DARK_TOKENS: Record<SemanticTokenKey, string> = {
  canvas: "#0b0b0d",
  "surface-rail": "#161619",
  "surface-panel": "#111114",
  "surface-elevated": "#1b1b1e",
  "surface-card": "#131316",
  "surface-card-hover": "#17171a",
  "surface-nested": "#0f0f12",
  "surface-overlay": "#212124",
  "surface-sunken": "#050507",
  "surface-hover": "rgba(255, 255, 255, 0.04)",
  "surface-active": "rgba(255, 255, 255, 0.08)",
  "overlay-scrim": "rgba(0, 0, 0, 0.50)",
  hairline: "rgba(255, 255, 255, 0.08)",
  "hairline-strong": "#3f3f46",
  "hairline-structural": "rgba(255, 255, 255, 0.13)",
  "edge-highlight": "rgba(255, 255, 255, 0.055)",
  "grid-dot": "rgba(255, 255, 255, 0.12)",
  "text-primary": "#f4f4f5",
  "text-secondary": "#bfbfc9",
  "text-muted": "#8e8e98",
  "text-inverse": "#09090b",
  primary: "#f4f4f5",
  "on-primary": "#09090b",
  "accent-focus": "#3b82f6",
  "accent-toggle-active": "#3b82f6",
  "accent-agent-active": "#56cde3",
  "accent-agent-idle": "#71717a",
  "status-active-session": "#56cde3",
  "status-success": "#5bcc80",
  "status-warning": "#ecc15a",
  "status-danger": "#ff8a84",
  "status-success-soft": "rgba(91, 204, 128, 0.14)",
  "status-warning-soft": "rgba(236, 193, 90, 0.14)",
  "status-danger-soft": "rgba(255, 138, 132, 0.14)",
  "status-interrupted": "#a1a1aa",
  "status-suspended": "#52525b",
  "status-archived": "#3f3f46",
  "border-control": "#71717a",
  "text-on-sunken": "#f4f4f5",
  "text-on-sunken-secondary": "#bfbfc9",
  "text-on-sunken-muted": "#8e8e98",
  "hairline-on-sunken": "rgba(255, 255, 255, 0.10)",
  "wash-on-sunken": "rgba(255, 255, 255, 0.05)",
  "diff-added": "#5bcc80",
  "diff-removed": "#ff8a84",
};

export const DEFAULT_LIGHT_TOKENS: Record<SemanticTokenKey, string> = {
  canvas: "#f4f4f5",
  "surface-rail": "#ffffff",
  "surface-panel": "#f9f9fa",
  "surface-elevated": "#ffffff",
  "surface-card": "#ffffff",
  "surface-card-hover": "#f4f4f5",
  "surface-nested": "#f4f4f5",
  "surface-overlay": "#ffffff",
  "surface-sunken": "#e4e4e7",
  "surface-hover": "rgba(0, 0, 0, 0.04)",
  "surface-active": "rgba(0, 0, 0, 0.08)",
  "overlay-scrim": "rgba(0, 0, 0, 0.30)",
  hairline: "rgba(0, 0, 0, 0.08)",
  "hairline-strong": "#c2c2ca",
  "hairline-structural": "rgba(0, 0, 0, 0.12)",
  "edge-highlight": "rgba(255, 255, 255, 0.9)",
  "grid-dot": "rgba(0, 0, 0, 0.12)",
  "text-primary": "#18181b",
  "text-secondary": "#3f3f46",
  "text-muted": "#63636c",
  "text-inverse": "#fafafa",
  primary: "#18181b",
  "on-primary": "#ffffff",
  "accent-focus": "#3b82f6",
  "accent-toggle-active": "#3b82f6",
  "accent-agent-active": "#007991",
  "accent-agent-idle": "#71717a",
  "status-active-session": "#007991",
  "status-success": "#00803a",
  "status-warning": "#9e6000",
  "status-danger": "#cd3437",
  "status-success-soft": "rgba(0, 128, 58, 0.10)",
  "status-warning-soft": "rgba(158, 96, 0, 0.10)",
  "status-danger-soft": "rgba(205, 52, 55, 0.10)",
  "status-interrupted": "#52525b",
  "status-suspended": "#a1a1aa",
  "status-archived": "#c8c8cf",
  "border-control": "#71717a",
  "text-on-sunken": "#18181b",
  "text-on-sunken-secondary": "#3f3f46",
  "text-on-sunken-muted": "#63636c",
  "hairline-on-sunken": "rgba(0, 0, 0, 0.10)",
  "wash-on-sunken": "rgba(0, 0, 0, 0.05)",
  "diff-added": "#046c4e",
  "diff-removed": "#b91c1c",
};

/**
 * DESIGN.md `stacking` — paint order, higher paints above lower. Structural,
 * so it is not a themeable semantic token and lives outside
 * `SEMANTIC_TOKEN_KEYS`. The `Esc` unstack order is derived from it.
 */
export const STACKING_SCALE = {
  base: 0,
  "drawer-scrim": 10,
  drawer: 20,
  "dialog-scrim": 30,
  dialog: 40,
  sheet: 50,
  palette: 60,
  popover: 70,
  toast: 80,
  tooltip: 90,
} as const;

export type StackingTier = keyof typeof STACKING_SCALE;

export const STACKING_TOKEN_TO_CSS_VAR: Record<StackingTier, string> = {
  base: "--tethys-z-base",
  "drawer-scrim": "--tethys-z-drawer-scrim",
  drawer: "--tethys-z-drawer",
  "dialog-scrim": "--tethys-z-dialog-scrim",
  dialog: "--tethys-z-dialog",
  sheet: "--tethys-z-sheet",
  palette: "--tethys-z-palette",
  popover: "--tethys-z-popover",
  toast: "--tethys-z-toast",
  tooltip: "--tethys-z-tooltip",
};

export interface ThemeManifest {
  id: string;
  name: string;
  base: "default-dark" | "default-light";
  vars: Partial<Record<SemanticTokenKey, string>>;
  meta?: {
    author?: string;
    version?: string;
  };
}

export function validateThemeManifest(
  input: unknown,
): { success: true; data: ThemeManifest } | { success: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { success: false, error: "Theme manifest must be an object" };
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.id !== "string" || obj.id.trim() === "") {
    return {
      success: false,
      error: "Theme manifest must have a non-empty string 'id'",
    };
  }

  if (typeof obj.name !== "string" || obj.name.trim() === "") {
    return {
      success: false,
      error: "Theme manifest must have a non-empty string 'name'",
    };
  }

  if (obj.base !== "default-dark" && obj.base !== "default-light") {
    return {
      success: false,
      error: "Theme manifest 'base' must be 'default-dark' or 'default-light'",
    };
  }

  if (!obj.vars || typeof obj.vars !== "object" || Array.isArray(obj.vars)) {
    return { success: false, error: "Theme manifest 'vars' must be an object" };
  }

  const validKeys = new Set<string>(SEMANTIC_TOKEN_KEYS);
  const vars = obj.vars as Record<string, unknown>;

  for (const [key, value] of Object.entries(vars)) {
    if (!validKeys.has(key)) {
      return {
        success: false,
        error: `Unknown semantic token key in vars: '${key}'`,
      };
    }
    if (typeof value !== "string" || value.trim() === "") {
      return {
        success: false,
        error: `Invalid value for token key '${key}': must be non-empty string`,
      };
    }
  }

  return {
    success: true,
    data: {
      id: obj.id,
      name: obj.name,
      base: obj.base,
      vars: vars as Partial<Record<SemanticTokenKey, string>>,
      meta:
        obj.meta && typeof obj.meta === "object"
          ? {
              author:
                typeof (obj.meta as Record<string, unknown>).author === "string"
                  ? ((obj.meta as Record<string, unknown>).author as string)
                  : undefined,
              version:
                typeof (obj.meta as Record<string, unknown>).version ===
                "string"
                  ? ((obj.meta as Record<string, unknown>).version as string)
                  : undefined,
            }
          : undefined,
    },
  };
}

export function resolveThemeVars(
  theme: ThemeManifest | "default-dark" | "default-light",
): Record<string, string> {
  if (theme === "default-dark") {
    const res: Record<string, string> = {};
    for (const key of SEMANTIC_TOKEN_KEYS) {
      res[SEMANTIC_TOKEN_TO_CSS_VAR[key]] = DEFAULT_DARK_TOKENS[key];
    }
    return res;
  }
  if (theme === "default-light") {
    const res: Record<string, string> = {};
    for (const key of SEMANTIC_TOKEN_KEYS) {
      res[SEMANTIC_TOKEN_TO_CSS_VAR[key]] = DEFAULT_LIGHT_TOKENS[key];
    }
    return res;
  }

  const baseTokens =
    theme.base === "default-light" ? DEFAULT_LIGHT_TOKENS : DEFAULT_DARK_TOKENS;
  const res: Record<string, string> = {};

  for (const key of SEMANTIC_TOKEN_KEYS) {
    const cssVar = SEMANTIC_TOKEN_TO_CSS_VAR[key];
    res[cssVar] = theme.vars[key] ?? baseTokens[key];
  }

  return res;
}

export function applyTheme(
  theme: ThemeManifest | "default-dark" | "default-light",
  targetElement?: HTMLElement,
): void {
  const target =
    targetElement ??
    (typeof document !== "undefined" ? document.documentElement : null);
  if (!target) return;

  if (theme === "default-dark") {
    target.removeAttribute("data-theme");
    // Clear custom overrides
    for (const key of SEMANTIC_TOKEN_KEYS) {
      target.style.removeProperty(SEMANTIC_TOKEN_TO_CSS_VAR[key]);
    }
    return;
  }

  if (theme === "default-light") {
    target.setAttribute("data-theme", "light");
    // Clear custom overrides
    for (const key of SEMANTIC_TOKEN_KEYS) {
      target.style.removeProperty(SEMANTIC_TOKEN_TO_CSS_VAR[key]);
    }
    return;
  }

  // Custom theme
  if (theme.base === "default-light") {
    target.setAttribute("data-theme", "light");
  } else {
    target.removeAttribute("data-theme");
  }

  const vars = resolveThemeVars(theme);
  for (const [cssVar, value] of Object.entries(vars)) {
    target.style.setProperty(cssVar, value);
  }
}
