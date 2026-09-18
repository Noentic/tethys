import React from "react";
import { cn } from "../lib/utils";

export interface ActionIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  ready?: boolean;
  label: string;
}

export const ActionIconButton = React.forwardRef<
  HTMLButtonElement,
  ActionIconButtonProps
>(({ children, ready = false, label, disabled, className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 select-none outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--tethys-accent-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tethys-canvas)]",
        "active:scale-95",
        ready
          ? "bg-[var(--tethys-primary)] text-[var(--tethys-on-primary)] hover:opacity-90 active:opacity-100"
          : "bg-[var(--tethys-surface-hover)] text-[var(--tethys-text-muted)] hover:text-[var(--tethys-text-primary)]",
        disabled && "pointer-events-none opacity-40 active:scale-100",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

ActionIconButton.displayName = "ActionIconButton";
