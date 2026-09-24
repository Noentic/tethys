import { useRef, useState } from "react";
import { cn } from "../lib/utils";

export interface EffortLevel {
  id: string;
  name: string;
  description?: string | null;
}

export interface ReasoningEffortProps {
  /** Accessible name of the slider, ending in ` effort` (the ⌘⇧E target). */
  label: string;
  /** The Provider's levels in its declared order, least effort first. */
  levels: EffortLevel[];
  value: string;
  onChange: (id: string) => void;
  /** The model the level applies to, named on the label while dragging or hovering. */
  caption?: string;
  className?: string;
}

/** Thumb diameter in px; the track keeps a radius of room at each end. */
const THUMB = 16;

/**
 * The ordered `thought_level` scale as a stepped slider (DESIGN.md
 * `reasoning-effort`, `composer-config-chip.orderedScale`): a tick per level,
 * a fill up to the current one, the provider's lowest and highest effort names
 * at the ends, and the current level named beneath. A native range input carries
 * the value, so arrows, Home/End and assistive tech work unchanged; the drawing
 * sits under it.
 */
export function ReasoningEffort({
  label,
  levels,
  value,
  onChange,
  className,
}: ReasoningEffortProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const index = Math.max(
    0,
    levels.findIndex((level) => level.id === value),
  );
  const current = levels[index];
  const steps = Math.max(1, levels.length - 1);
  const at = (step: number) =>
    `calc(${THUMB / 2}px + ${step / steps} * (100% - ${THUMB}px))`;

  const labelStyle = (step: number, total: number): React.CSSProperties => {
    if (total <= 1) return { left: "50%", transform: "translateX(-50%)" };
    if (step === 0) return { left: 0, transform: "none" };
    if (step === total - 1) return { right: 0, transform: "none" };
    return { left: at(step), transform: "translateX(-50%)" };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current || levels.length <= 1) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left - THUMB / 2;
    const trackWidth = rect.width - THUMB;
    if (trackWidth <= 0) return;
    const fraction = Math.max(0, Math.min(1, x / trackWidth));
    const step = Math.round(fraction * steps);
    setHoveredIndex(step);
  };

  return (
    <div className={cn("flex w-72 flex-col gap-1.5", className)}>
      <div
        ref={trackRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredIndex(null)}
        className="relative h-7 rounded-full has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-(--tethys-accent-focus)"
      >
        <div className="absolute inset-x-0 top-1/2 h-5 -translate-y-1/2 rounded-full border border-(--tethys-hairline) bg-(--tethys-surface-hover)" />
        <div
          className="absolute top-1/2 left-0 h-5 -translate-y-1/2 rounded-full bg-(--tethys-surface-active) transition-[width] duration-150 ease-out"
          style={{ width: `calc(${at(index)} + ${THUMB / 2}px)` }}
        />
        {levels.map((level, step) => {
          const isHovered = hoveredIndex === step;
          const isSelected = index === step;
          return (
            <span
              key={level.id}
              aria-hidden="true"
              className={cn(
                "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-100",
                isHovered || isSelected ? "h-3" : "h-2",
                isHovered
                  ? "w-0.5 bg-(--tethys-text-primary)"
                  : step <= index
                    ? "w-px bg-(--tethys-text-muted)"
                    : "w-px bg-(--tethys-hairline-strong)",
              )}
              style={{ left: at(step) }}
            />
          );
        })}
        <span
          aria-hidden="true"
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-(--tethys-hairline-strong) bg-(--tethys-text-primary) transition-[left] duration-150 ease-out"
          style={{ left: at(index) }}
        />
        <input
          type="range"
          aria-label={label}
          aria-valuetext={current?.name}
          min={0}
          max={levels.length - 1}
          step={1}
          value={index}
          onBlur={() => setHoveredIndex(null)}
          onChange={(event) => {
            const next = levels[Number(event.target.value)];
            if (next) onChange(next.id);
          }}
          className="absolute inset-0 m-0 h-full w-full cursor-grab appearance-none opacity-0 active:cursor-grabbing"
        />
      </div>
      <div className="relative mt-1 h-5 select-none" role="presentation">
        {levels.map((level, step) => {
          const isSelected = index === step;
          const isHovered = hoveredIndex === step;
          return (
            <button
              key={level.id}
              type="button"
              onClick={() => onChange(level.id)}
              onPointerEnter={() => setHoveredIndex(step)}
              onPointerLeave={() => setHoveredIndex(null)}
              className={cn(
                "focus-ring absolute top-0 rounded-xs px-1 text-label-sm transition-colors",
                isSelected
                  ? "font-semibold text-(--tethys-text-primary)"
                  : isHovered
                    ? "text-(--tethys-text-primary)"
                    : "text-(--tethys-text-muted) hover:text-(--tethys-text-secondary)",
              )}
              style={labelStyle(step, levels.length)}
            >
              <span className="block max-w-[72px] truncate" title={level.name}>
                {level.name}
              </span>
            </button>
          );
        })}
      </div>
      {current?.description && (
        <p className="mt-0.5 truncate text-label-sm text-(--tethys-text-muted)">
          {current.description}
        </p>
      )}
    </div>
  );
}
