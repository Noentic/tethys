import type React from "react";
import { cn } from "../lib/utils";

export interface KeycapPillProps extends React.HTMLAttributes<HTMLElement> {
  keys?: string[];
}

export function KeycapPill({
  children,
  keys,
  className,
  ...props
}: KeycapPillProps) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border border-[var(--tethys-hairline-strong)] bg-[var(--tethys-surface-hover)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--tethys-text-secondary)] select-none shadow-none",
        className,
      )}
      {...props}
    >
      {keys ? keys.join(" + ") : children}
    </kbd>
  );
}
