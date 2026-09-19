import { ChevronDown } from "@nebutra/icons";
import type React from "react";
import { cn } from "../lib/utils";

export interface SessionGroupHeaderProps {
  title: string;
  count?: number;
  collapsed?: boolean;
  onToggle?: () => void;
  level?: 1 | 2; // 1 = Workspace, 2 = Provider
  icon?: React.ReactNode;
  className?: string;
}

export function SessionGroupHeader({
  title,
  count,
  collapsed = false,
  onToggle,
  level = 1,
  icon,
  className,
}: SessionGroupHeaderProps) {
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      onClick={onToggle}
      className={cn(
        "focus-ring-inset flex h-7 w-full cursor-pointer items-center justify-between px-3 text-label-sm text-(--tethys-text-muted) transition-colors select-none",
        level === 1
          ? "bg-transparent uppercase tracking-wider"
          : "pl-5 bg-transparent",
        "hover:text-(--tethys-text-secondary)",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <ChevronDown
          className={cn(
            "size-3 shrink-0 transition-transform duration-150",
            collapsed ? "-rotate-90" : "rotate-0",
          )}
          aria-hidden="true"
        />
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate">{title}</span>
      </div>
      {typeof count === "number" && (
        <span className="font-mono text-mono-micro text-(--tethys-text-muted)">
          {count}
        </span>
      )}
    </button>
  );
}
