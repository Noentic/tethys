import { Cross } from "@nebutra/icons";
import type React from "react";
import { useRef } from "react";
import { useFocusTrap } from "../lib/use-focus-trap";
import { cn } from "../lib/utils";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
  side?: "right" | "left";
  showScrim?: boolean;
  /**
   * The child supplies its own header and close control (the Inspector's header
   * carries the session's state badge). The drawer still provides the scrim,
   * the focus trap and restore, and the stacking tier.
   */
  bare?: boolean;
  /** The accessible name when there is no string `title`. */
  label?: string;
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "w-[380px]",
  side = "right",
  showScrim = true,
  bare = false,
  label,
  className,
}: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  useFocusTrap({
    active: open,
    containerRef: drawerRef,
    tier: "drawer",
    onEscape: onClose,
  });

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop scrim dismissal
    <div
      role="presentation"
      className={cn(
        "fixed inset-0 z-(--tethys-z-drawer) flex",
        side === "right" ? "justify-end" : "justify-start",
        showScrim ? "bg-(--tethys-overlay-scrim)" : "pointer-events-none",
      )}
      onClick={(e) => {
        if (showScrim && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === "string" ? title : "Drawer")}
        tabIndex={-1}
        className={cn(
          "pointer-events-auto flex h-full flex-col bg-(--tethys-surface-elevated) outline-none transition-transform duration-200",
          side === "right"
            ? "border-l border-(--tethys-hairline-strong)"
            : "border-r border-(--tethys-hairline-strong)",
          width,
          className,
        )}
      >
        {bare ? (
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        ) : (
          <>
            <div className="flex h-12 items-center justify-between border-b border-(--tethys-hairline) px-lg">
              <div className="truncate text-heading-md text-(--tethys-text-primary)">
                {title}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close drawer"
                className="focus-ring flex h-7 w-7 items-center justify-center rounded-md text-(--tethys-text-muted) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)"
              >
                <Cross className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-lg">{children}</div>
          </>
        )}
      </div>
    </div>
  );
}
