import React from "react";
import { cn } from "../lib/utils";
import { ActivityOrb } from "./activity-orb";

export interface ActionIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  ready?: boolean;
  /**
   * A turn is running (DESIGN.md `action-icon-button.dualState`): the button
   * shows the activity orb and, on hover or keyboard focus, the stop square
   * its press will act on. `children` is ignored while running.
   */
  running?: boolean;
  label: string;
}

export const ActionIconButton = React.forwardRef<
  HTMLButtonElement,
  ActionIconButtonProps
>(
  (
    {
      children,
      ready = false,
      running = false,
      label,
      disabled,
      className,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-150 select-none [&_svg]:size-[18px]",
          "focus-ring",
          "active:scale-95",
          running
            ? "group border border-(--tethys-hairline-strong) bg-(--tethys-surface-elevated) text-(--tethys-text-primary) hover:bg-(--tethys-surface-hover)"
            : ready
              ? "bg-(--tethys-primary) text-(--tethys-on-primary) hover:opacity-90 active:opacity-100"
              : "bg-(--tethys-surface-active) text-(--tethys-text-muted) hover:text-(--tethys-text-primary)",
          disabled && "pointer-events-none active:scale-100",
          className,
        )}
        {...props}
      >
        {running ? (
          <>
            <ActivityOrb className="group-hover:hidden group-focus-visible:hidden" />
            <span
              aria-hidden="true"
              className="hidden size-3 rounded-[2px] bg-current group-hover:block group-focus-visible:block"
            />
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);

ActionIconButton.displayName = "ActionIconButton";
