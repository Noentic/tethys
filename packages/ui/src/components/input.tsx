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
          "relative flex items-center w-full rounded-md border border-(--tethys-hairline-strong) bg-(--tethys-surface-panel) transition-all duration-150",
          "focus-within:border-(--tethys-accent-focus) focus-within:ring-2 focus-within:ring-(--tethys-accent-focus) focus-within:ring-offset-2 focus-within:ring-offset-(--tethys-canvas)",
          disabled && "opacity-40 pointer-events-none",
        )}
      >
        {leadingIcon && (
          <span className="flex items-center justify-center pl-2.5 text-(--tethys-text-muted)">
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          disabled={disabled}
          className={cn(
            "w-full bg-transparent px-3 py-1.5 text-sm text-(--tethys-text-primary) placeholder-(--tethys-text-muted) outline-none disabled:cursor-not-allowed",
            leadingIcon && "pl-2",
            trailingIcon && "pr-2",
            className,
          )}
          {...props}
        />
        {trailingIcon && (
          <span className="flex items-center justify-center pr-2.5 text-(--tethys-text-muted)">
            {trailingIcon}
          </span>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
