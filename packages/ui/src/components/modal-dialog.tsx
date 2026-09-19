import type React from "react";
import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";

export interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  className?: string;
}

export function ModalDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = "max-w-[480px]",
  className,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current =
        document.activeElement as HTMLElement | null;
      dialogRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        } else if (e.key === "Tab" && dialogRef.current) {
          // Focus trap
          const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-(--tethys-overlay-scrim)"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "dialog-title" : undefined}
        aria-describedby={description ? "dialog-description" : undefined}
        tabIndex={-1}
        className={cn(
          "edge-lit w-full rounded-lg border border-(--tethys-hairline-strong) bg-(--tethys-surface-overlay) p-xl outline-none",
          maxWidth,
          className,
        )}
      >
        {title && (
          <h2
            id="dialog-title"
            className="text-heading-md text-(--tethys-text-primary)"
          >
            {title}
          </h2>
        )}
        {description && (
          <p
            id="dialog-description"
            className="mt-1 text-body-sm text-(--tethys-text-muted)"
          >
            {description}
          </p>
        )}
        <div className="mt-4">{children}</div>
        {footer && (
          <div className="mt-xl flex items-center justify-end gap-sm border-t border-(--tethys-hairline) pt-lg">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
