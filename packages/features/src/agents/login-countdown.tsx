//! URL+code countdown (DESIGN.md `login-dialog.countdown`).
//!
//! `m:ss` remaining, updating once per second as a text change (not an
//! animation, so reduced motion is unaffected). Numeric because these codes
//! expire on a ~300s scale, unlike the 5s `stop-control` fill.

import { useEffect, useState } from "react";

/** Formats a remaining duration as `m:ss`. */
export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Seconds between `deadline` and `now`, never negative. */
export function secondsUntil(deadline: string, now: number): number {
  const target = Date.parse(deadline);
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.ceil((target - now) / 1000));
}

export interface LoginCountdownProps {
  /** RFC 3339 instant the code expires. */
  deadline: string;
  onExpire?: () => void;
  /** Clock seam for tests. */
  now?: () => number;
  className?: string;
}

export function LoginCountdown({
  deadline,
  onExpire,
  now = Date.now,
  className,
}: LoginCountdownProps): React.ReactElement {
  const [remaining, setRemaining] = useState(() =>
    secondsUntil(deadline, now()),
  );

  useEffect(() => {
    const tick = () => {
      const next = secondsUntil(deadline, now());
      setRemaining(next);
      if (next === 0) onExpire?.();
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [deadline, now, onExpire]);

  return (
    <span
      data-testid="login-countdown"
      className={`font-mono text-mono-micro text-(--tethys-text-muted) ${className ?? ""}`}
      aria-live="off"
    >
      {formatCountdown(remaining)}
    </span>
  );
}
