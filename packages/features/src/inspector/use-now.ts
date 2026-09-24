import { useEffect, useState } from "react";

/**
 * The current time, re-read every `intervalMs` while `active`. Elapsed labels
 * (`Thinking · 4s`, `Working · 14s`) tick as text once a second, so nothing
 * about liveness depends on motion (DESIGN.md `working-indicator.motion`).
 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

/** `14s`, `2m 05s`: short enough to sit in a one-line label. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}
