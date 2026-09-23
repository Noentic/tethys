import type React from "react";
import { cn } from "../lib/utils";
import { statusMotionClass } from "../session-state";

export interface ApprovalInboxPillProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  count: number;
  selected?: boolean;
  label?: string;
  hideAtZero?: boolean;
}

export function ApprovalInboxPill({
  count,
  selected = false,
  label = "Waiting on you",
  hideAtZero = true,
  className,
  ...props
}: ApprovalInboxPillProps) {
  if (hideAtZero && count === 0 && !selected) {
    return null;
  }

  return (
    <button
      type="button"
      aria-label={`${label} (${count})`}
      className={cn(
        "focus-ring inline-flex h-7 items-center gap-2 rounded-full px-2.5 font-mono text-mono-micro transition-colors duration-150 select-none",
        selected
          ? "border border-(--tethys-status-warning) bg-(--tethys-status-warning-soft) text-(--tethys-text-primary)"
          : "border border-transparent bg-(--tethys-surface-hover) text-(--tethys-text-secondary) hover:bg-(--tethys-surface-active) hover:text-(--tethys-text-primary)",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-(--tethys-status-warning)",
          count > 0 && statusMotionClass("breatheAwaiting"),
        )}
        aria-hidden="true"
      />
      <span>
        {label} ({count})
      </span>
    </button>
  );
}
