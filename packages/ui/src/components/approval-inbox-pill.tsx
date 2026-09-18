import type React from "react";
import { cn } from "../lib/utils";

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
        "inline-flex h-5 items-center gap-1.5 rounded-full px-2 font-mono text-[11px] font-medium transition-all duration-150 select-none outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--tethys-accent-focus)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--tethys-canvas)]",
        selected
          ? "border border-[var(--tethys-status-warning)] bg-[rgba(245,158,11,0.15)] text-[var(--tethys-text-primary)]"
          : "border border-transparent bg-[var(--tethys-surface-hover)] text-[var(--tethys-text-secondary)] hover:bg-[var(--tethys-surface-active)] hover:text-[var(--tethys-text-primary)]",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-[var(--tethys-status-warning)]",
          count > 0 && "motion-safe:animate-pulse",
        )}
        aria-hidden="true"
      />
      <span>
        {label} ({count})
      </span>
    </button>
  );
}
