import type React from "react";
import { cn } from "../lib/utils";

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  icon?: React.ReactNode;
  onRemove?: () => void;
  interactive?: boolean;
}

export function Chip({
  children,
  icon,
  onRemove,
  interactive = false,
  className,
  ...props
}: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-[4px] bg-[var(--tethys-surface-hover)] px-1.5 font-mono text-[11px] font-medium text-[var(--tethys-text-secondary)] select-none transition-colors",
        interactive &&
          "cursor-pointer hover:bg-[var(--tethys-surface-active)] hover:text-[var(--tethys-text-primary)]",
        className,
      )}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 flex h-3.5 w-3.5 items-center justify-center rounded hover:bg-[var(--tethys-surface-active)] hover:text-[var(--tethys-text-primary)]"
        >
          ×
        </button>
      )}
    </span>
  );
}
