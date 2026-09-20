import type React from "react";
import { useEffect, useRef } from "react";
import { cn } from "../lib/utils";

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  className?: string;
  role?: "dialog" | "listbox";
}

export function Popover({
  open,
  onClose,
  anchorRef,
  children,
  className,
  role = "dialog",
}: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !anchorRef?.current?.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      role={role}
      tabIndex={-1}
      className={cn(
        "edge-lit absolute z-(--tethys-z-popover) rounded-md border border-(--tethys-hairline-strong) bg-(--tethys-surface-overlay) p-1 outline-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
