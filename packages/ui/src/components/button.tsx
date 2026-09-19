import React from "react";
import { cn } from "../lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "default" | "lg";
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "secondary",
      size = "default",
      loading = false,
      disabled,
      className,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 select-none rounded-md transition-colors duration-150",
          "focus-ring",
          "active:scale-[0.99]",
          size === "sm" && "h-7 px-2.5 text-label-md",
          size === "default" && "h-8 px-3.5 text-body-sm font-medium",
          size === "lg" && "h-9 px-4 text-body-md font-medium",
          variant === "primary" &&
            "bg-(--tethys-primary) text-(--tethys-on-primary) hover:opacity-90 active:opacity-100",
          variant === "secondary" &&
            "edge-lit border border-(--tethys-hairline-strong) bg-(--tethys-surface-elevated) text-(--tethys-text-primary) hover:bg-(--tethys-surface-card-hover)",
          variant === "ghost" &&
            "bg-transparent text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)",
          variant === "destructive" &&
            "border border-(--tethys-status-danger) text-(--tethys-status-danger) hover:tint-danger",
          isDisabled && "pointer-events-none opacity-40 active:scale-100",
          className,
        )}
        {...props}
      >
        {loading && (
          <svg
            className="h-4 w-4 animate-spin text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
