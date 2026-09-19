import React from "react";
import { cn } from "../lib/utils";

export interface SplitterProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  valueNow?: number;
  valueMin?: number;
  valueMax?: number;
  isDragging?: boolean;
  onReset?: () => void;
}

export const Splitter = React.forwardRef<HTMLDivElement, SplitterProps>(
  (
    {
      orientation = "vertical",
      valueNow,
      valueMin,
      valueMax,
      isDragging = false,
      onReset,
      className,
      ...props
    },
    ref,
  ) => {
    const isVertical = orientation === "vertical";

    return (
      // biome-ignore lint/a11y/useSemanticElements: custom resizable splitter requires role="separator" with aria-valuenow
      <div
        ref={ref}
        role="separator"
        aria-orientation={orientation}
        aria-valuenow={valueNow}
        aria-valuemin={valueMin}
        aria-valuemax={valueMax}
        tabIndex={0}
        onDoubleClick={onReset}
        className={cn(
          "focus-ring group relative flex items-center justify-center transition-colors duration-150 select-none",
          isVertical
            ? "w-[6px] mx-[-2.5px] cursor-col-resize h-full z-10"
            : "h-[6px] my-[-2.5px] cursor-row-resize w-full z-10",
          className,
        )}
        {...props}
      >
        {/* The 1px visible line */}
        <div
          className={cn(
            "transition-colors duration-150",
            isVertical ? "h-full w-px" : "w-full h-px",
            isDragging
              ? "bg-(--tethys-accent-focus)"
              : "bg-(--tethys-hairline-structural) group-hover:bg-(--tethys-text-muted)",
          )}
        />
      </div>
    );
  },
);

Splitter.displayName = "Splitter";
