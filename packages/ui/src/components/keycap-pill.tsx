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
        "inline-flex items-center gap-1 rounded-xs border border-(--tethys-hairline-strong) bg-(--tethys-surface-hover) px-1.5 py-0.5 font-mono text-mono-micro text-(--tethys-text-secondary) select-none",
        className,
      )}
      {...props}
    >
      {keys ? keys.join(" + ") : children}
    </kbd>
  );
}
