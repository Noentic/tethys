import React from "react";
import { cn } from "../lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, leadingIcon, trailingIcon, disabled, ...props }, ref) => {
    return (
      <div
        className={cn(
          "relative flex h-8 w-full items-center rounded-sm border border-(--tethys-border-control) bg-(--tethys-surface-panel) transition-colors duration-150",
          "focus-ring-within focus-within:border-(--tethys-accent-focus)",
          disabled && "opacity-40 pointer-events-none",
        )}
      >
        {leadingIcon && (
          <span className="flex items-center justify-center pl-2 text-(--tethys-text-muted)">
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          disabled={disabled}
          className={cn(
            "h-full w-full bg-transparent px-2.5 text-body-sm text-(--tethys-text-primary) placeholder-(--tethys-text-muted) outline-none disabled:cursor-not-allowed",
            leadingIcon && "pl-2",
            trailingIcon && "pr-2",
            className,
          )}
          {...props}
        />
        {trailingIcon && (
          <span className="flex items-center justify-center pr-2 text-(--tethys-text-muted)">
            {trailingIcon}
          </span>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
