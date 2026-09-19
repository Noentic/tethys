import React from "react";
import { cn } from "../lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Level 2: hover lifts to surface-card-hover with the strong hairline. */
  interactive?: boolean;
}

// Level 1 surface (DESIGN.md Elevation & Depth): card tone, 1px hairline, lg radius.
// Padding is left to the caller so dense lists and roomy panels share one surface.
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ interactive = false, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-card)",
        interactive &&
          "cursor-pointer transition-colors duration-150 hover:border-(--tethys-hairline-strong) hover:bg-(--tethys-surface-card-hover)",
        className,
      )}
      {...props}
    />
  ),
);

Card.displayName = "Card";
