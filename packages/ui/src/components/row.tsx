import React from "react";
import { cn } from "../lib/utils";

export interface RowProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  disabled?: boolean;
  borderBottom?: boolean;
}

export const Row = React.forwardRef<HTMLDivElement, RowProps>(
  (
    {
      children,
      selected = false,
      disabled = false,
      borderBottom = false,
      className,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        data-selected={selected ? "true" : undefined}
        aria-disabled={disabled}
        className={cn(
          "flex items-center gap-2 rounded-sm px-3 py-1.5 text-xs transition-colors duration-150 select-none outline-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--tethys-accent-focus)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--tethys-canvas)]",
          selected
            ? "bg-[var(--tethys-surface-active)] text-[var(--tethys-text-primary)] font-medium"
            : "text-[var(--tethys-text-secondary)] hover:bg-[var(--tethys-surface-hover)] hover:text-[var(--tethys-text-primary)]",
          borderBottom && "border-b border-[var(--tethys-hairline)]",
          disabled && "pointer-events-none opacity-40",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Row.displayName = "Row";
