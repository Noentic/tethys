import React from "react";
import { cn } from "../lib/utils";

export interface ToggleSwitchProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
  className?: string;
}

export const ToggleSwitch = React.forwardRef<
  HTMLButtonElement,
  ToggleSwitchProps
>(
  (
    {
      checked,
      onCheckedChange,
      disabled = false,
      label,
      id,
      className,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange?.(!checked)}
        className={cn(
          "relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150 outline-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--tethys-accent-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tethys-canvas)]",
          checked
            ? "bg-[var(--tethys-accent-toggle)]"
            : "bg-[var(--tethys-hairline-strong)]",
          disabled && "cursor-not-allowed opacity-40",
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none block h-[14px] w-[14px] rounded-full bg-[var(--tethys-primary)] transition-transform duration-150",
            checked ? "translate-x-[16px]" : "translate-x-[2px]",
          )}
        />
      </button>
    );
  },
);

ToggleSwitch.displayName = "ToggleSwitch";
