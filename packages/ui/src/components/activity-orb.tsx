import type { CSSProperties } from "react";
import { cn } from "../lib/utils";

/** The lattice is N×N dots. */
const N = 3;
/** One sweep of the band across the grid, in ms (DESIGN.md motion.orb). */
const CYCLE_MS = 1500;

const CELLS = Array.from({ length: N * N }, (_, index) => ({
  x: index % N,
  y: Math.floor(index / N),
}));

/**
 * Where a cell sits in the sweep. A broad band crosses the grid on the
 * diagonal: cells on the same diagonal light together and each diagonal lags
 * the last. The delay is negative so the band is already moving on the first
 * frame instead of starting from a blank grid.
 */
function cellDelay(x: number, y: number): number {
  return ((x + y) / (2 * (N - 1))) * CYCLE_MS - CYCLE_MS;
}

export interface ActivityOrbProps {
  /** Rendered box in px; the lattice scales with it. */
  size?: number;
  className?: string;
  /** Names the activity for assistive tech. Omit when a parent already does. */
  label?: string;
}

/**
 * The agent-activity indicator (DESIGN.md `activity-orb`, variant S2): a 3×3
 * dot lattice with a diagonal band sweeping through it. It replaces the
 * spinner wherever a turn is running. It draws in `currentColor`, pauses on an
 * unfocused window, and holds a static, still-legible frame under
 * prefers-reduced-motion, so no state depends on the motion.
 */
export function ActivityOrb({ size = 18, className, label }: ActivityOrbProps) {
  const dot = Math.max(2, Math.round(size / 6));
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-content-center",
        className,
      )}
      style={{
        width: size,
        height: size,
        gridTemplateColumns: `repeat(${N}, ${dot}px)`,
        gap: Math.max(1, Math.round(dot * 0.75)),
      }}
    >
      {label && <span className="sr-only">{label}</span>}
      {CELLS.map(({ x, y }) => (
        <span
          key={`${x}-${y}`}
          aria-hidden="true"
          className="rounded-full bg-current opacity-60 motion-safe:animate-orb-cell motion-loop"
          style={
            {
              width: dot,
              height: dot,
              animationDelay: `${cellDelay(x, y)}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
