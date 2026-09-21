/**
 * The thread view's width arithmetic (DESIGN.md Shell Structure): three
 * regions, Rail | Stage | Inspector, with Sessions as an on-demand overlay
 * drawer. Pure, so the invariant that matters, that the Stage never falls under
 * its minimum while the Inspector is docked, is proven directly instead of
 * through a jsdom layout that `react-resizable-panels` does not compute.
 */

export const RAIL_WIDTH = 48;
export const STAGE_MIN_WIDTH = 560;
export const INSPECTOR_WIDTH = 360;
export const INSPECTOR_COLLAPSED_WIDTH = 40;
export const INSPECTOR_OVERLAY_BREAKPOINT = 1100;

/** The narrowest window that docks the Inspector with the Stage at its minimum. */
export const DOCKED_MIN_WIDTH = RAIL_WIDTH + STAGE_MIN_WIDTH + INSPECTOR_WIDTH;

export interface ShellLayoutInput {
  windowWidth: number;
  /** Whether the active view has an Inspector at all (the thread view). */
  hasInspector: boolean;
  inspectorCollapsed: boolean;
  sessionsOpen: boolean;
}

export interface ShellLayout {
  /** `overlay` means a drawer over the Stage that takes no width from it. */
  inspector: "none" | "docked" | "collapsed" | "overlay";
  /** Sessions is never docked: it is closed, or an overlay drawer. */
  sessions: "closed" | "overlay";
  /** The width the Stage has to itself. */
  stageWidth: number;
}

export function computeShellLayout({
  windowWidth,
  hasInspector,
  inspectorCollapsed,
  sessionsOpen,
}: ShellLayoutInput): ShellLayout {
  const sessions = sessionsOpen ? "overlay" : "closed";
  const remaining = windowWidth - RAIL_WIDTH;

  if (!hasInspector) {
    return { inspector: "none", sessions, stageWidth: remaining };
  }
  if (windowWidth < INSPECTOR_OVERLAY_BREAKPOINT) {
    return { inspector: "overlay", sessions, stageWidth: remaining };
  }
  if (inspectorCollapsed) {
    return {
      inspector: "collapsed",
      sessions,
      stageWidth: remaining - INSPECTOR_COLLAPSED_WIDTH,
    };
  }
  return {
    inspector: "docked",
    sessions,
    stageWidth: remaining - INSPECTOR_WIDTH,
  };
}
