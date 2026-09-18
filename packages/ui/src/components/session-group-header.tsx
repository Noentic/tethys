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
        "flex h-7 w-full items-center justify-between px-3 font-medium text-[11px] text-(--tethys-text-muted) select-none cursor-pointer outline-none transition-colors",
        level === 1
          ? "bg-transparent uppercase tracking-wider"
          : "pl-5 bg-transparent",
        "hover:text-(--tethys-text-secondary)",
        "focus-visible:ring-1 focus-visible:ring-(--tethys-accent-focus)",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className={cn(
            "text-[10px] transition-transform duration-150 shrink-0",
            collapsed ? "-rotate-90" : "rotate-0",
          )}
          aria-hidden="true"
        >
          ▾
        </span>
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate">{title}</span>
      </div>
      {typeof count === "number" && (
        <span className="font-mono text-[10px] text-(--tethys-text-muted)">
          {count}
        </span>
      )}
    </button>
  );
}
