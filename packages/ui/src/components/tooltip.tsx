import type React from "react";
import { useState } from "react";
import { cn } from "../lib/utils";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
}

export function Tooltip({
  content,
  children,
  className,
  side = "top",
}: TooltipProps) {
  const [visible, setVisible] = useState(false);

  if (!content) return children;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover trigger wrapper for tooltip
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={cn(
            "absolute z-50 whitespace-nowrap rounded-[4px] border border-[var(--tethys-hairline-strong)] bg-[var(--tethys-surface-elevated)] px-2 py-1 font-mono text-[11px] text-[var(--tethys-text-primary)] shadow-none pointer-events-none transition-opacity duration-150",
            side === "top" && "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
            side === "bottom" && "top-full left-1/2 mt-1.5 -translate-x-1/2",
            side === "left" && "right-full top-1/2 mr-1.5 -translate-y-1/2",
            side === "right" && "left-full top-1/2 ml-1.5 -translate-y-1/2",
            className,
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
