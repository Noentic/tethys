//! Read-only terminal surface (M1.7 U7).
//!
//! Agent-owned output only: `xterm.js` with `disableStdin: true`, no PTY, no
//! stdin wiring, and no write/resize callback. Read-only is a property of what
//! is wired, not a runtime flag. Under `prefers-reduced-motion` (or when
//! `xterm` is unavailable, as in `jsdom`) it falls back to a `<pre>` tail.

import { cn } from "@tethys/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** The only options passed to `xterm.js`; `disableStdin` is the read-only guarantee. */
export const terminalOptions = {
  disableStdin: true,
  convertEol: true,
  cursorBlink: false,
  fontSize: 12,
  scrollback: 10_000,
} as const;

/**
 * xterm paints its own canvas, so it cannot inherit the well's background. Read
 * the well tokens back from CSS so the canvas follows the active theme instead
 * of xterm's built-in black.
 */
export function sunkenWellTheme(element: HTMLElement) {
  const read = (name: string, fallback: string) => {
    const value = getComputedStyle(element).getPropertyValue(name).trim();
    return value === "" ? fallback : value;
  };
  return {
    background: read("--tethys-surface-sunken", "#050507"),
    foreground: read("--tethys-text-on-sunken-secondary", "#bfbfc9"),
  };
}

interface TerminalLike {
  write(data: string): void;
  dispose(): void;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Follows the OS setting live. Reading it once on mount left a terminal that
 * kept animating (or kept its static tail) after the user changed it.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => false,
  );
}

/** The delta to write for a growing buffer; empty when nothing was appended. */
export function nextTerminalDelta(previous: string, next: string): string {
  if (next.length <= previous.length) {
    return "";
  }
  return next.slice(previous.length);
}

export interface TerminalViewProps {
  output: string;
  title?: string;
  className?: string;
}

export function TerminalView({ output, title, className }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<TerminalLike | null>(null);
  const writtenRef = useRef(0);
  const reducedMotion = usePrefersReducedMotion();
  const [loadFailed, setLoadFailed] = useState(false);
  // The static tail replaces the animated surface for reduced motion, and also
  // when xterm cannot load.
  const useFallback = reducedMotion || loadFailed;

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only; output deltas are handled below
  useEffect(() => {
    if (useFallback) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { Terminal } = await import("@xterm/xterm");
        if (cancelled || !containerRef.current) {
          return;
        }
        const terminal = new Terminal({
          ...terminalOptions,
          theme: sunkenWellTheme(containerRef.current),
        }) as unknown as TerminalLike;
        (terminal as unknown as { open(el: HTMLElement): void }).open(
          containerRef.current,
        );
        terminalRef.current = terminal;
        writtenRef.current = 0;
        terminal.write(output);
        writtenRef.current = output.length;
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      terminalRef.current?.dispose();
      terminalRef.current = null;
    };
    // Mount-only: output deltas are handled by the effect below.
  }, [useFallback]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }
    if (output.length < writtenRef.current) {
      writtenRef.current = 0;
    }
    const delta = nextTerminalDelta(
      output.slice(0, writtenRef.current),
      output,
    );
    if (delta) {
      terminal.write(delta);
      writtenRef.current = output.length;
    }
  }, [output, output.length]);

  if (useFallback) {
    return (
      <pre
        data-testid="terminal-fallback"
        role="log"
        aria-label={title ?? "Terminal output"}
        className={cn(
          "max-h-80 overflow-auto rounded-sm bg-(--tethys-surface-sunken) p-sm font-mono text-mono-code text-(--tethys-text-on-sunken-secondary)",
          className,
        )}
      >
        {output}
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="terminal-surface"
      role="log"
      aria-label={title ?? "Terminal output"}
      className={cn(
        "max-h-80 overflow-hidden rounded-sm bg-(--tethys-surface-sunken)",
        className,
      )}
    />
  );
}
