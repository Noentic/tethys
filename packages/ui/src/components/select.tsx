import { ChevronDown } from "@nebutra/icons";
import React from "react";
import { cn } from "../lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

// Native select restyled to the Input recipe (32px, sm radius, strong hairline) so
// every dropdown in the app shares one control shape and the OS handles the popup.
// `appearance-none` strips the platform widget (white in WebKitGTK); the chevron
// is ours, and `color-scheme` on the root themes what stays native.
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <span className="relative inline-flex items-center">
      <select
        ref={ref}
        className={cn(
          "peer focus-ring h-8 appearance-none rounded-sm border border-(--tethys-border-control) bg-(--tethys-surface-panel) px-2.5 pr-7 text-body-sm text-(--tethys-text-primary) transition-colors",
          "focus-visible:border-(--tethys-accent-focus) disabled:cursor-not-allowed disabled:opacity-40",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2 size-3.5 text-(--tethys-text-muted) peer-disabled:opacity-40"
      />
    </span>
  ),
);

Select.displayName = "Select";
