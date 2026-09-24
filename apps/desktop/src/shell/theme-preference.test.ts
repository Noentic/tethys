import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyThemePreference,
  getThemePreference,
  resolveScheme,
  setCodeFont,
  setColorScheme,
  setTypeSizePx,
  setUiFont,
  setZoomPercent,
  stepZoom,
} from "./theme-preference";

beforeEach(async () => {
  globalThis.localStorage?.clear();
  setColorScheme("dark");
  setUiFont("Geist Sans");
  setCodeFont("Geist Mono");
  setTypeSizePx(14);
  await setZoomPercent(100);
});

describe("theme preference", () => {
  it("defaults new display fields when loading an existing saved preference", async () => {
    localStorage.setItem(
      "tethys.theme-preference",
      JSON.stringify({
        scheme: "light",
        uiFont: "System Sans",
        codeFont: "JetBrains Mono",
      }),
    );
    vi.resetModules();
    const { getThemePreference: readPreference } = await import(
      "./theme-preference"
    );

    expect(readPreference()).toMatchObject({
      scheme: "light",
      uiFont: "System Sans",
      codeFont: "JetBrains Mono",
      zoomPercent: 100,
      typeSizePx: 14,
    });
  });

  it("writes the resolved theme to the document", () => {
    setColorScheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    setColorScheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("follows the OS only while the scheme is System", () => {
    expect(resolveScheme("system", true)).toBe("light");
    expect(resolveScheme("system", false)).toBe("dark");
    expect(resolveScheme("light", false)).toBe("light");
    expect(resolveScheme("dark", true)).toBe("dark");
  });

  it("persists across a re-read of storage", async () => {
    setColorScheme("light");
    setUiFont("System Sans");
    setCodeFont("JetBrains Mono");
    setTypeSizePx(16);
    await setZoomPercent(130);
    expect(
      JSON.parse(localStorage.getItem("tethys.theme-preference") ?? "{}"),
    ).toMatchObject({
      scheme: "light",
      uiFont: "System Sans",
      codeFont: "JetBrains Mono",
      zoomPercent: 130,
      typeSizePx: 16,
    });
  });

  it("applies and resets the shared type-size offset", () => {
    setTypeSizePx(16);
    expect(
      document.documentElement.style.getPropertyValue("--tethys-type-offset"),
    ).toBe("2px");
    setTypeSizePx(14);
    expect(
      document.documentElement.style.getPropertyValue("--tethys-type-offset"),
    ).toBe("");
  });

  it("bounds type size and serializes rapid zoom steps", async () => {
    setTypeSizePx(30);
    setTypeSizePx(Number.NaN);
    expect(getThemePreference().typeSizePx).toBe(18);

    const requests = [stepZoom("in"), stepZoom("in"), stepZoom("in")];
    await Promise.all(requests);
    expect(getThemePreference().zoomPercent).toBe(130);
    expect(document.documentElement.style.zoom).toBe("1.3");

    await setZoomPercent(300);
    expect(getThemePreference().zoomPercent).toBe(200);
  });

  it("applies the font stacks and clears them for the shipped defaults", () => {
    setUiFont("System Sans");
    expect(
      document.documentElement.style.getPropertyValue("--font-sans"),
    ).toContain("system-ui");
    setUiFont("Geist Sans");
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toBe(
      "",
    );
  });

  it("ignores a value the picker does not offer", () => {
    setColorScheme("neon" as "dark");
    expect(getThemePreference().scheme).not.toBe("neon");
    setUiFont("Comic Sans");
    expect(getThemePreference().uiFont).toBe("Geist Sans");
  });

  it("re-applies the current preference idempotently", () => {
    setColorScheme("light");
    applyThemePreference();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
