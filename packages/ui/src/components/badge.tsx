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
        "inline-flex items-center gap-1 select-none rounded-xs border transition-colors",
        size === "sm"
          ? "px-1.5 py-0.5 text-label-sm"
          : "px-2 py-0.5 font-mono text-mono-micro",
        variant === "default" &&
          "border-(--tethys-hairline) bg-(--tethys-surface-hover) text-(--tethys-text-secondary)",
        variant === "muted" &&
          "border-(--tethys-hairline) bg-(--tethys-surface-hover) text-(--tethys-text-muted)",
        variant === "warning" &&
          "border-(--tethys-status-warning) tint-warning text-(--tethys-status-warning)",
        variant === "success" &&
          "border-(--tethys-status-success) tint-success text-(--tethys-status-success)",
        variant === "danger" &&
          "border-(--tethys-status-danger) tint-danger text-(--tethys-status-danger)",
        variant === "outline" &&
          "border-(--tethys-hairline-strong) bg-transparent text-(--tethys-text-secondary)",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
