import type React from "react";
import { cn } from "../lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "warning" | "success" | "danger" | "muted" | "outline";
  size?: "sm" | "default";
}

export function Badge({
  children,
  variant = "default",
  size = "default",
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium select-none rounded-[4px] border transition-colors",
        size === "sm"
          ? "px-1.5 py-0.5 text-[10px] leading-tight"
          : "px-2 py-0.5 text-[11px] leading-snug font-mono",
        variant === "default" &&
          "border-[var(--tethys-hairline)] bg-[var(--tethys-surface-hover)] text-[var(--tethys-text-secondary)]",
        variant === "muted" &&
          "border-[var(--tethys-hairline)] bg-[var(--tethys-surface-hover)] text-[var(--tethys-text-muted)]",
        variant === "warning" &&
          "border-[var(--tethys-status-warning)] bg-[rgba(245,158,11,0.1)] text-[var(--tethys-status-warning)]",
        variant === "success" &&
          "border-[var(--tethys-status-success)] bg-[rgba(16,185,129,0.1)] text-[var(--tethys-status-success)]",
        variant === "danger" &&
          "border-[var(--tethys-status-danger)] bg-[rgba(239,68,68,0.1)] text-[var(--tethys-status-danger)]",
        variant === "outline" &&
          "border-[var(--tethys-hairline-strong)] bg-transparent text-[var(--tethys-text-secondary)]",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
