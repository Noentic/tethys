import React from "react";
import { cn } from "../lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, disabled, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        disabled={disabled}
        className={cn(
          "w-full rounded-md border border-[var(--tethys-hairline)] bg-transparent p-3 text-sm text-[var(--tethys-text-primary)] placeholder-[var(--tethys-text-muted)] outline-none transition-all duration-150",
          "focus-visible:border-[var(--tethys-accent-focus)] focus-visible:ring-2 focus-visible:ring-[var(--tethys-accent-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--tethys-canvas)]",
          error &&
            "border-[var(--tethys-status-danger)] focus-visible:border-[var(--tethys-status-danger)] focus-visible:ring-[var(--tethys-status-danger)]",
          disabled && "opacity-40 pointer-events-none cursor-not-allowed",
          className,
        )}
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";
