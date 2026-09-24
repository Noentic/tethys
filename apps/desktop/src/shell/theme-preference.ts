//! Persisted appearance preference: colour scheme and font stacks.
//!
//! One writer sets `data-theme` on `<html>` (the shipped pair the tokens file
//! swaps) and the `--font-sans` / `--font-mono` overrides. `system` follows
//! `prefers-color-scheme` and re-applies when the OS setting changes, so the
//! window never needs a reload. Custom theme manifests stay out of scope.

import { isTauri } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";

export type ColorScheme = "system" | "dark" | "light";

export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;
export const ZOOM_STEP = 10;
export const TYPE_SIZE_MIN = 13;
export const TYPE_SIZE_MAX = 18;
export const DEFAULT_TYPE_SIZE = 14;

/** Picker label → CSS font stack; the first entry of each list is the default. */
export const UI_FONTS: Record<string, string> = {
  "Geist Sans": "",
  "System Sans":
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  Inter: '"Inter", ui-sans-serif, system-ui, sans-serif',
};
export const CODE_FONTS: Record<string, string> = {
  "Geist Mono": "",
  "JetBrains Mono": '"JetBrains Mono", ui-monospace, monospace',
  "Fira Code": '"Fira Code", ui-monospace, monospace',
};

export interface ThemePreference {
  scheme: ColorScheme;
  uiFont: string;
  codeFont: string;
  zoomPercent: number;
  typeSizePx: number;
}

const STORAGE_KEY = "tethys.theme-preference";
const DEFAULT_PREFERENCE: ThemePreference = {
  scheme: "dark",
  uiFont: "Geist Sans",
  codeFont: "Geist Mono",
  zoomPercent: 100,
  typeSizePx: DEFAULT_TYPE_SIZE,
};

const listeners = new Set<() => void>();
let current: ThemePreference = read();
let requestedZoomPercent = current.zoomPercent;
let zoomQueue = Promise.resolve();

function read(): ThemePreference {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCE;
    const parsed = JSON.parse(raw) as Partial<ThemePreference>;
    const zoomPercent = parsed.zoomPercent;
    const typeSizePx = parsed.typeSizePx;
    return {
      scheme:
        parsed.scheme === "light" || parsed.scheme === "system"
          ? parsed.scheme
          : "dark",
      uiFont:
        parsed.uiFont && UI_FONTS[parsed.uiFont] !== undefined
          ? parsed.uiFont
          : DEFAULT_PREFERENCE.uiFont,
      codeFont:
        parsed.codeFont && CODE_FONTS[parsed.codeFont] !== undefined
          ? parsed.codeFont
          : DEFAULT_PREFERENCE.codeFont,
      zoomPercent:
        typeof zoomPercent === "number" &&
        Number.isInteger(zoomPercent) &&
        zoomPercent >= ZOOM_MIN &&
        zoomPercent <= ZOOM_MAX &&
        zoomPercent % ZOOM_STEP === 0
          ? zoomPercent
          : DEFAULT_PREFERENCE.zoomPercent,
      typeSizePx:
        typeof typeSizePx === "number" &&
        Number.isInteger(typeSizePx) &&
        typeSizePx >= TYPE_SIZE_MIN &&
        typeSizePx <= TYPE_SIZE_MAX
          ? typeSizePx
          : DEFAULT_PREFERENCE.typeSizePx,
    };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

/** The OS preference when it can be read; a bare test defaults to dark. */
export function systemPrefersLight(): boolean {
  try {
    return (
      globalThis.matchMedia?.("(prefers-color-scheme: light)").matches ?? false
    );
  } catch {
    return false;
  }
}

/** Resolves `system` against the OS; `dark` / `light` pass through. */
export function resolveScheme(
  scheme: ColorScheme,
  prefersLight = systemPrefersLight(),
): "dark" | "light" {
  if (scheme === "system") return prefersLight ? "light" : "dark";
  return scheme;
}

function applyFontStack(cssVar: "--font-sans" | "--font-mono", stack: string) {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  if (stack) root.style.setProperty(cssVar, stack);
  else root.style.removeProperty(cssVar);
}

/** Writes the resolved theme and fonts to the document. Idempotent. */
export function applyThemePreference(
  preference: ThemePreference = current,
): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  root.setAttribute("data-theme", resolveScheme(preference.scheme));
  applyFontStack("--font-sans", UI_FONTS[preference.uiFont] ?? "");
  applyFontStack("--font-mono", CODE_FONTS[preference.codeFont] ?? "");
  const typeOffset = preference.typeSizePx - DEFAULT_TYPE_SIZE;
  if (typeOffset)
    root.style.setProperty("--tethys-type-offset", `${typeOffset}px`);
  else root.style.removeProperty("--tethys-type-offset");
}

function write(next: ThemePreference): void {
  current = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (tests, privacy mode): the in-memory value holds.
  }
  applyThemePreference(next);
  for (const listener of listeners) listener();
}

export function getThemePreference(): ThemePreference {
  return current;
}

export function setColorScheme(scheme: ColorScheme): void {
  if (scheme !== "system" && scheme !== "dark" && scheme !== "light") return;
  write({ ...current, scheme });
}

export function setUiFont(uiFont: string): void {
  if (UI_FONTS[uiFont] === undefined) return;
  write({ ...current, uiFont });
}

export function setCodeFont(codeFont: string): void {
  if (CODE_FONTS[codeFont] === undefined) return;
  write({ ...current, codeFont });
}

export function setTypeSizePx(typeSizePx: number): void {
  if (!Number.isFinite(typeSizePx)) return;
  const value = Math.min(
    TYPE_SIZE_MAX,
    Math.max(TYPE_SIZE_MIN, Math.round(typeSizePx)),
  );
  write({ ...current, typeSizePx: value });
}

async function applyZoom(zoomPercent: number): Promise<void> {
  const root = globalThis.document?.documentElement;
  if (isTauri()) {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    await getCurrentWebview().setZoom(zoomPercent / 100);
  } else if (root) {
    if (zoomPercent === 100) root.style.removeProperty("zoom");
    else root.style.setProperty("zoom", String(zoomPercent / 100));
  }
}

export function applyStoredZoom(): Promise<void> {
  return applyZoom(current.zoomPercent);
}

export function setZoomPercent(zoomPercent: number): Promise<void> {
  if (!Number.isFinite(zoomPercent)) return Promise.resolve();
  const value = Math.min(
    ZOOM_MAX,
    Math.max(ZOOM_MIN, Math.round(zoomPercent / ZOOM_STEP) * ZOOM_STEP),
  );
  requestedZoomPercent = value;

  const request = zoomQueue.then(async () => {
    await applyZoom(value);
    write({ ...current, zoomPercent: value });
  });
  zoomQueue = request.catch(() => {
    if (requestedZoomPercent === value) {
      requestedZoomPercent = current.zoomPercent;
    }
  });
  return request;
}

export function stepZoom(direction: "in" | "out"): Promise<void> {
  return setZoomPercent(
    requestedZoomPercent + (direction === "in" ? ZOOM_STEP : -ZOOM_STEP),
  );
}

/** The resolved theme, for a control that names what is on screen right now. */
export function useResolvedTheme(): "dark" | "light" {
  const preference = useThemePreference();
  return resolveScheme(preference.scheme);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current,
  );
}

// Boot and OS-following: apply once on import, then re-apply on a system change.
applyThemePreference();
try {
  globalThis
    .matchMedia?.("(prefers-color-scheme: light)")
    ?.addEventListener("change", () => {
      if (current.scheme === "system") applyThemePreference();
    });
} catch {
  // No matchMedia (jsdom default): the explicit scheme still applies.
}
