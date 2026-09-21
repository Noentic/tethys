import { beforeEach, describe, expect, it } from "vitest";
import {
  applyThemePreference,
  getThemePreference,
  resolveScheme,
  setCodeFont,
  setColorScheme,
  setUiFont,
} from "./theme-preference";

beforeEach(() => {
  globalThis.localStorage?.clear();
  setColorScheme("dark");
  setUiFont("Geist Sans");
  setCodeFont("Geist Mono");
});

describe("theme preference", () => {
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

  it("persists across a re-read of storage", () => {
    setColorScheme("light");
    setUiFont("System Sans");
    setCodeFont("JetBrains Mono");
    expect(
      JSON.parse(localStorage.getItem("tethys.theme-preference") ?? "{}"),
    ).toMatchObject({
      scheme: "light",
      uiFont: "System Sans",
      codeFont: "JetBrains Mono",
    });
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
