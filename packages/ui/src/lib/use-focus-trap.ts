/**
 * The one focus-trap behaviour (DESIGN.md Accessibility & Keyboard Map): `Tab`
 * wraps inside the surface, `Esc` closes it, and focus returns to whatever held
 * it when the surface opened. Drawers, dialogs and the Provider popover all use
 * this rather than each keeping a copy.
 *
 * Traps register with their tier from the stacking scale. Only the topmost one
 * answers a key, so a dialog opened over a drawer wraps and closes on its own
 * and hands focus back into the drawer, and a surface can ask whether a lower
 * trap is open (`useFocusTrapBelow`) and queue instead of opening over it.
 */

import { type RefObject, useEffect, useRef, useSyncExternalStore } from "react";
import { STACKING_SCALE, type StackingTier } from "../tokens/manifest";

interface ActiveTrap {
  tier: number;
}

const active: ActiveTrap[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The trap that owns the keyboard: the highest tier, the latest among equals. */
function topmost(): ActiveTrap | undefined {
  return active.reduce<ActiveTrap | undefined>(
    (top, trap) => (top === undefined || trap.tier >= top.tier ? trap : top),
    undefined,
  );
}

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface FocusTrapOptions {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  /** Where this surface paints; decides which trap is on top. */
  tier: StackingTier;
  onEscape: () => void;
  /**
   * Where focus lands on open: the container itself (a `dialog` role takes
   * focus) or its first control (a popover with actions).
   */
  initialFocus?: "container" | "first";
}

export function useFocusTrap({
  active: isActive,
  containerRef,
  tier,
  onEscape,
  initialFocus = "container",
}: FocusTrapOptions): void {
  // Read through a ref so the effect depends on whether the trap is active, not
  // on the caller's handler identity. A caller that re-renders often (the shell
  // does, on every session update) would otherwise restore focus to the invoker
  // and pull it back in on each render.
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const container = containerRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const trap: ActiveTrap = { tier: STACKING_SCALE[tier] };
    active.push(trap);
    notify();

    const focusables = () =>
      Array.from(
        container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));
    if (initialFocus === "first") {
      focusables()[0]?.focus();
    } else {
      container?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (topmost() !== trap) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const items = focusables();
      if (items.length === 0) {
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // `window`, so an event dispatched on the window (and one that bubbles up
    // from any element) reaches the trap alike.
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      active.splice(active.indexOf(trap), 1);
      notify();
      previous?.focus?.();
    };
  }, [isActive, containerRef, tier, initialFocus]);
}

/**
 * Whether a trap below `tier` is open. A surface that traps focus never opens
 * over one, so it waits (DESIGN.md `provider-popover.focus`).
 */
export function useFocusTrapBelow(tier: StackingTier): boolean {
  const below = () => active.some((trap) => trap.tier < STACKING_SCALE[tier]);
  return useSyncExternalStore(subscribe, below, below);
}

export function clearFocusTrapsForTesting(): void {
  active.length = 0;
  notify();
}
