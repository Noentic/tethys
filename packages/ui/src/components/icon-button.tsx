import React from "react";
import { cn } from "../lib/utils";

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "compact" | "default" | "rail";
  variant?: "ghost" | "secondary" | "destructive";
  label: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      children,
      size = "default",
      variant = "ghost",
      label,
      disabled,
      className,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex items-center justify-center rounded-md transition-colors duration-150 select-none",
          "focus-ring",
          "active:scale-[0.97]",
          size === "compact" && "h-7 w-7",
          size === "default" && "h-8 w-8",
          size === "rail" && "h-9 w-9",
          variant === "ghost" &&
            "bg-transparent text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)",
          variant === "secondary" &&
            "edge-lit border border-(--tethys-hairline-strong) bg-(--tethys-surface-elevated) text-(--tethys-text-primary) hover:bg-(--tethys-surface-card-hover)",
          variant === "destructive" &&
            "text-(--tethys-status-danger) hover:bg-(--tethys-status-danger-soft)",
          disabled && "pointer-events-none opacity-40 active:scale-100",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

IconButton.displayName = "IconButton";
