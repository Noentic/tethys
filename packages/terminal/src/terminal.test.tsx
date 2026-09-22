import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  nextTerminalDelta,
  sunkenWellTheme,
  TerminalView,
  terminalOptions,
} from "./index";

describe("@tethys/terminal surface (M1.7 U7)", () => {
  it("themes the xterm canvas from the well tokens, not xterm's black", () => {
    const element = document.createElement("div");
    element.style.setProperty("--tethys-surface-sunken", "#e4e4e7");
    element.style.setProperty("--tethys-text-on-sunken-secondary", "#3f3f46");
    expect(sunkenWellTheme(element)).toEqual({
      background: "#e4e4e7",
      foreground: "#3f3f46",
    });
  });

  it("reads the well's own text token, so a dark well on a light theme stays legible", () => {
    // A custom theme may keep the well dark while the page is light: the
    // foreground must follow the well, not the theme's ordinary secondary text.
    const element = document.createElement("div");
    element.style.setProperty("--tethys-surface-sunken", "#0b0b0d");
    element.style.setProperty("--tethys-text-secondary", "#3f3f46");
    element.style.setProperty("--tethys-text-on-sunken-secondary", "#bfbfc9");
    expect(sunkenWellTheme(element).foreground).toBe("#bfbfc9");
  });

  it("falls back to the dark well pair when the tokens are not defined", () => {
    expect(sunkenWellTheme(document.createElement("div"))).toEqual({
      background: "#050507",
      foreground: "#bfbfc9",
    });
  });

  it("wires xterm with stdin disabled and exposes no input affordance", () => {
    expect(terminalOptions.disableStdin).toBe(true);
    const { container, queryByRole } = render(
      <TerminalView output={"$ ls\r\nsrc\r\n"} />,
    );
    expect(queryByRole("textbox")).toBeNull();
    expect(container.querySelector("input, textarea")).toBeNull();
    expect(container.querySelector('[contenteditable="true"]')).toBeNull();
  });

  it("renders ANSI output without error", async () => {
    const { container } = render(
      <TerminalView output={"\u001b[31mred\u001b[0m plain"} />,
    );
    await waitFor(() => expect(container.textContent).toContain("plain"));
  });

  it("writes only the appended delta as output grows", () => {
    expect(nextTerminalDelta("hello", "hello world")).toBe(" world");
    expect(nextTerminalDelta("hello", "hello")).toBe("");
    // A shrinking buffer (a reset) is not a delta write.
    expect(nextTerminalDelta("hello world", "hello")).toBe("");
  });

  describe("prefers-reduced-motion (live)", () => {
    // A controllable matchMedia: the OS setting can change while a terminal is
    // mounted, and the surface has to follow it rather than read it once.
    function stubReducedMotion(initial: boolean) {
      let matches = initial;
      const listeners = new Set<() => void>();
      const original = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        get matches() {
          return matches;
        },
        media: query,
        addEventListener: (_: string, listener: () => void) =>
          listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) =>
          listeners.delete(listener),
      })) as unknown as typeof window.matchMedia;
      return {
        set(next: boolean) {
          matches = next;
          act(() => {
            for (const listener of [...listeners]) listener();
          });
        },
        restore() {
          window.matchMedia = original;
        },
      };
    }

    it("swaps to the static tail when the setting turns on, and back when it turns off", async () => {
      const media = stubReducedMotion(false);
      try {
        render(<TerminalView output={"$ ls\r\nsrc\r\n"} />);
        expect(screen.getByTestId("terminal-surface")).toBeDefined();
        expect(screen.queryByTestId("terminal-fallback")).toBeNull();

        media.set(true);
        expect(screen.getByTestId("terminal-fallback").textContent).toContain(
          "src",
        );
        expect(screen.queryByTestId("terminal-surface")).toBeNull();

        media.set(false);
        expect(screen.getByTestId("terminal-surface")).toBeDefined();
        expect(screen.queryByTestId("terminal-fallback")).toBeNull();
      } finally {
        media.restore();
      }
    });

    it("starts on the static tail when the setting is already on", () => {
      const media = stubReducedMotion(true);
      try {
        render(<TerminalView output="static" />);
        expect(screen.getByTestId("terminal-fallback")).toBeDefined();
      } finally {
        media.restore();
      }
    });

    it("keeps line input available for Terminal Auth in reduced-motion mode", () => {
      const media = stubReducedMotion(true);
      const onData = vi.fn();
      try {
        render(<TerminalView output="Enter code:" onData={onData} />);
        const input = screen.getByLabelText("Terminal input");
        fireEvent.change(input, { target: { value: "ABCD" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onData).toHaveBeenCalledWith("ABCD\r");
      } finally {
        media.restore();
      }
    });

    it("stops listening on unmount", () => {
      const media = stubReducedMotion(false);
      try {
        const { unmount } = render(<TerminalView output="x" />);
        unmount();
        expect(() => media.set(true)).not.toThrow();
      } finally {
        media.restore();
      }
    });
  });
});
