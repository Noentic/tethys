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
            "pointer-events-none absolute z-50 whitespace-nowrap rounded-xs border border-(--tethys-hairline-strong) bg-(--tethys-surface-overlay) px-2 py-1 font-mono text-mono-micro text-(--tethys-text-primary) transition-opacity duration-150",
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
