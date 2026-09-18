import type React from "react";
import { cn } from "../lib/utils";

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  options: Array<SegmentedControlOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "default";
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  className,
  size = "default",
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex items-center rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-panel) p-0.5 select-none",
        size === "sm" ? "h-7" : "h-8",
        className,
      )}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: custom styled segmented radio control
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-full items-center justify-center rounded-sm px-3 font-medium transition-all duration-150 outline-none",
              size === "sm" ? "text-xs" : "text-xs font-medium",
              "focus-visible:ring-2 focus-visible:ring-(--tethys-accent-focus) focus-visible:ring-offset-1 focus-visible:ring-offset-(--tethys-canvas)",
              isSelected
                ? "border border-(--tethys-hairline) bg-(--tethys-surface-elevated) text-(--tethys-text-primary) shadow-none"
                : "border border-transparent bg-transparent text-(--tethys-text-muted) hover:text-(--tethys-text-secondary)",
              option.disabled && "pointer-events-none opacity-40",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
