import * as PopoverPrimitive from "@radix-ui/react-popover";
import type React from "react";
import { useRef } from "react";
import { cn } from "../lib/utils";

/** The gap the popover keeps from the window edge when it shifts or flips. */
const COLLISION_PADDING = 8;

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /**
   * The control the popover hangs from. Without one it anchors to its nearest
   * positioned ancestor, which callers keep as the trigger's `relative` wrapper.
   */
  anchorRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  className?: string;
  role?: "dialog" | "listbox";
  /** Preferred side; it flips to the opposite one when the window has no room. */
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  /** Move focus into the popover on open. Off by default: most callers keep it in the composer. */
  autoFocus?: boolean;
}

/**
 * The Level 4 floating surface (DESIGN.md `popover`). It portals to the body so
 * no container clips it, flips and shifts to stay inside the window, and never
 * grows past the room the window has, so a long list scrolls instead of running
 * off screen at any zoom or type size.
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  children,
  className,
  role = "dialog",
  side = "bottom",
  align = "start",
  sideOffset = 6,
  autoFocus = false,
}: PopoverProps) {
  const fallbackAnchorRef = useRef<HTMLDivElement>(null);

  // A press on the trigger toggles the popover itself, so it must not count as
  // an outside press that closes it first and reopens it straight after.
  const isOnTrigger = (target: EventTarget | null) => {
    const trigger =
      anchorRef?.current ?? fallbackAnchorRef.current?.parentElement;
    return target instanceof Node && Boolean(trigger?.contains(target));
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {anchorRef ? (
        <PopoverPrimitive.Anchor
          virtualRef={anchorRef as React.RefObject<HTMLElement>}
        />
      ) : (
        <PopoverPrimitive.Anchor
          ref={fallbackAnchorRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        />
      )}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          role={role}
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={COLLISION_PADDING}
          onOpenAutoFocus={(event) => {
            if (!autoFocus) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (isOnTrigger(event.target)) event.preventDefault();
          }}
          className={cn(
            "edge-lit z-(--tethys-z-popover) max-h-(--radix-popover-content-available-height) max-w-(--radix-popover-content-available-width) overflow-y-auto rounded-md border border-(--tethys-hairline-strong) bg-(--tethys-surface-overlay) p-1 text-(--tethys-text-primary) outline-none",
            className,
          )}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
