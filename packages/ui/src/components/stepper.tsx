import React from "react";
import { cn } from "../lib/utils";

export interface StepperInputProps {
  value: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  formatValue?: (val: number) => string;
  className?: string;
  label?: string;
}

export const StepperInput = React.forwardRef<HTMLDivElement, StepperInputProps>(
  (
    {
      value,
      onChange,
      min = 0,
      max = 3600,
      step = 10,
      disabled = false,
      formatValue,
      className,
      label = "Stepper input",
    },
    ref,
  ) => {
    const handleDecrement = () => {
      if (disabled) return;
      const next = Math.max(min, value - step);
      onChange?.(next);
    };

    const handleIncrement = () => {
      if (disabled) return;
      const next = Math.min(max, value + step);
      onChange?.(next);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        handleDecrement();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        handleIncrement();
      }
    };

    const display = formatValue
      ? formatValue(value)
      : value === 0
        ? "0 (Manual)"
        : `${value}s`;

    return (
      <div
        ref={ref}
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        onKeyDown={handleKeyDown}
        className={cn(
          "inline-flex h-8 items-center rounded-md border border-[var(--tethys-hairline)] bg-[var(--tethys-surface-panel)] outline-none transition-all",
          "focus-visible:ring-2 focus-visible:ring-[var(--tethys-accent-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tethys-canvas)]",
          disabled && "cursor-not-allowed opacity-40",
          className,
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || value <= min}
          onClick={handleDecrement}
          aria-label="Decrement"
          className="flex h-full w-7 items-center justify-center text-xs font-mono text-[var(--tethys-text-secondary)] hover:bg-[var(--tethys-surface-hover)] disabled:pointer-events-none disabled:opacity-40"
        >
          −
        </button>
        <span className="min-w-[70px] px-2 text-center font-mono text-xs font-medium text-[var(--tethys-text-primary)] select-none">
          {display}
        </span>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || value >= max}
          onClick={handleIncrement}
          aria-label="Increment"
          className="flex h-full w-7 items-center justify-center text-xs font-mono text-[var(--tethys-text-secondary)] hover:bg-[var(--tethys-surface-hover)] disabled:pointer-events-none disabled:opacity-40"
        >
          +
        </button>
      </div>
    );
  },
);

StepperInput.displayName = "StepperInput";
