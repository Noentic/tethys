import React from "react";
import { cn } from "../lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

// Native select restyled to the Input recipe (32px, sm radius, strong hairline) so
// every dropdown in the app shares one control shape and the OS handles the popup.
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "focus-ring h-8 rounded-sm border border-(--tethys-border-control) bg-(--tethys-surface-panel) px-2.5 text-body-sm text-(--tethys-text-primary) transition-colors",
        "focus-visible:border-(--tethys-accent-focus) disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  ),
);

Select.displayName = "Select";
