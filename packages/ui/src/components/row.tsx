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
          "focus-ring relative flex min-h-9 items-center gap-2 rounded-sm px-3 py-1.5 text-body-sm transition-colors duration-150 select-none",
          selected
            ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-0.5 before:rounded-r-xs before:bg-(--tethys-accent-focus)"
            : "text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)",
          borderBottom && "border-b border-(--tethys-hairline)",
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
