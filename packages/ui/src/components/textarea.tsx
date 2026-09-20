import React from "react";
import { cn } from "../lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  /** No border, padding or ring: for use inside a container that owns the frame. */
  bare?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, bare = false, disabled, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        disabled={disabled}
        className={cn(
          "w-full bg-transparent text-body-md text-(--tethys-text-primary) placeholder-(--tethys-text-muted)",
          bare
            ? "resize-none border-0 p-0 outline-none"
            : "rounded-md border border-(--tethys-hairline-strong) p-3 transition-colors duration-150 focus-ring focus-visible:border-(--tethys-accent-focus)",
          error &&
            "border-(--tethys-status-danger) focus-visible:border-(--tethys-status-danger) focus-visible:outline-(--tethys-status-danger)",
          disabled && "opacity-40 pointer-events-none cursor-not-allowed",
          className,
        )}
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";
