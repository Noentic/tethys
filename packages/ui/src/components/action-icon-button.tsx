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
        "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150 select-none",
        "focus-ring",
        "active:scale-95",
        ready
          ? "bg-(--tethys-primary) text-(--tethys-on-primary) hover:opacity-90 active:opacity-100"
          : "bg-(--tethys-surface-active) text-(--tethys-text-muted) hover:text-(--tethys-text-primary)",
        disabled && "pointer-events-none active:scale-100",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

ActionIconButton.displayName = "ActionIconButton";
