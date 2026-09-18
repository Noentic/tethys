import type React from "react";
import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
  side?: "right" | "left";
  showScrim?: boolean;
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
  className,
}: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current =
        document.activeElement as HTMLElement | null;
      drawerRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        } else if (e.key === "Tab" && drawerRef.current) {
          const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );
          if (focusables.length === 0) return;

          const first = focusables[0];
          const last = focusables[focusables.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        previouslyFocusedRef.current?.focus();
      };
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop scrim dismissal
    <div
      role="presentation"
      className={cn(
        "fixed inset-0 z-40 flex",
        side === "right" ? "justify-end" : "justify-start",
        showScrim ? "bg-[var(--tethys-overlay-scrim)]" : "pointer-events-none",
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
        aria-label={typeof title === "string" ? title : "Drawer"}
        tabIndex={-1}
        className={cn(
          "pointer-events-auto flex h-full flex-col bg-[var(--tethys-surface-elevated)] outline-none shadow-none transition-transform duration-200",
          side === "right"
            ? "border-l border-[var(--tethys-hairline-strong)]"
            : "border-r border-[var(--tethys-hairline-strong)]",
          width,
          className,
        )}
      >
        <div className="flex h-12 items-center justify-between border-b border-[var(--tethys-hairline)] px-4">
          <div className="text-sm font-semibold text-[var(--tethys-text-primary)] truncate">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--tethys-text-muted)] hover:bg-[var(--tethys-surface-hover)] hover:text-[var(--tethys-text-primary)]"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
