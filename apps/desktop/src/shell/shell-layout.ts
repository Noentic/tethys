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
/** Below this the Inspector's rows cannot hold a label and its value. */
export const INSPECTOR_MIN_WIDTH = 320;
/** The Changes tab's floor: a diff narrower than this cannot be read. */
export const CHANGES_MIN_WIDTH = 480;
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

/**
 * The docked Changes tab's width (DESIGN.md `side-panel.width`):
 * clamp(changes-min, 50% of the window, window − rail − stage-min). The upper
 * bound keeps the Stage at its minimum, so it wins when the two disagree.
 */
export function changesWidth(windowWidth: number): number {
  const room = windowWidth - RAIL_WIDTH - STAGE_MIN_WIDTH;
  return Math.max(
    INSPECTOR_MIN_WIDTH,
    Math.min(Math.max(CHANGES_MIN_WIDTH, windowWidth * 0.5), room),
  );
}

/** Whether a docked Changes tab fits beside the Stage; otherwise it overlays. */
export function changesFitDocked(windowWidth: number): boolean {
  return (
    windowWidth >= INSPECTOR_OVERLAY_BREAKPOINT &&
    windowWidth - RAIL_WIDTH - STAGE_MIN_WIDTH >= CHANGES_MIN_WIDTH
  );
}
