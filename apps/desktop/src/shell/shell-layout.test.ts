import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeShellLayout,
  DOCKED_MIN_WIDTH,
  INSPECTOR_COLLAPSED_WIDTH,
  INSPECTOR_OVERLAY_BREAKPOINT,
  INSPECTOR_WIDTH,
  RAIL_WIDTH,
  STAGE_MIN_WIDTH,
} from "./shell-layout";

const thread = { hasInspector: true, inspectorCollapsed: false };

describe("shell layout: Rail | Stage | Inspector", () => {
  it("docks the Inspector on a wide window and leaves Sessions undocked", () => {
    const layout = computeShellLayout({
      windowWidth: 1440,
      sessionsOpen: false,
      ...thread,
    });
    expect(layout.inspector).toBe("docked");
    expect(layout.sessions).toBe("closed");
    expect(layout.stageWidth).toBe(1440 - RAIL_WIDTH - INSPECTOR_WIDTH);
    expect(layout.stageWidth).toBeGreaterThanOrEqual(STAGE_MIN_WIDTH);
  });

  it("opening Sessions overlays the Stage and never narrows it", () => {
    const closed = computeShellLayout({
      windowWidth: 1280,
      sessionsOpen: false,
      ...thread,
    });
    const open = computeShellLayout({
      windowWidth: 1280,
      sessionsOpen: true,
      ...thread,
    });
    expect(open.sessions).toBe("overlay");
    expect(open.stageWidth).toBe(closed.stageWidth);
  });

  it("switches the Inspector to an overlay exactly at the breakpoint", () => {
    const at = (windowWidth: number) =>
      computeShellLayout({ windowWidth, sessionsOpen: false, ...thread });
    expect(at(INSPECTOR_OVERLAY_BREAKPOINT - 1).inspector).toBe("overlay");
    expect(at(INSPECTOR_OVERLAY_BREAKPOINT).inspector).toBe("docked");
    expect(at(1100).stageWidth).toBe(1100 - RAIL_WIDTH - INSPECTOR_WIDTH);
    // An overlay takes no width from the Stage.
    expect(at(900).stageWidth).toBe(900 - RAIL_WIDTH);
  });

  it("collapses the docked Inspector to its 40px rail", () => {
    const layout = computeShellLayout({
      windowWidth: 1280,
      sessionsOpen: false,
      hasInspector: true,
      inspectorCollapsed: true,
    });
    expect(layout.inspector).toBe("collapsed");
    expect(layout.stageWidth).toBe(
      1280 - RAIL_WIDTH - INSPECTOR_COLLAPSED_WIDTH,
    );
  });

  it("has no Inspector outside a thread", () => {
    const layout = computeShellLayout({
      windowWidth: 1440,
      sessionsOpen: false,
      hasInspector: false,
      inspectorCollapsed: false,
    });
    expect(layout.inspector).toBe("none");
    expect(layout.stageWidth).toBe(1440 - RAIL_WIDTH);
  });

  it("keeps the Stage at its minimum at every width where the Inspector docks", () => {
    for (let windowWidth = 300; windowWidth <= 3840; windowWidth += 1) {
      for (const sessionsOpen of [false, true]) {
        const layout = computeShellLayout({
          windowWidth,
          sessionsOpen,
          ...thread,
        });
        if (layout.inspector === "docked") {
          expect(
            layout.stageWidth,
            `${windowWidth}px, sessions ${sessionsOpen}`,
          ).toBeGreaterThanOrEqual(STAGE_MIN_WIDTH);
        }
      }
    }
  });

  it("derives the docked minimum from the regions, and the breakpoint clears it", () => {
    expect(DOCKED_MIN_WIDTH).toBe(48 + 560 + 360);
    expect(DOCKED_MIN_WIDTH).toBe(968);
    // The d0-rc5 gap: a breakpoint below the docked need would dock the
    // Inspector while the Stage is under its minimum.
    expect(INSPECTOR_OVERLAY_BREAKPOINT).toBeGreaterThanOrEqual(
      DOCKED_MIN_WIDTH,
    );
  });
});

describe("shell layout constants match DESIGN.md", () => {
  const design = readFileSync(
    resolve(__dirname, "../../../../DESIGN.md"),
    "utf-8",
  );
  const px = (pattern: RegExp): number => {
    const found = design.match(pattern);
    if (!found) throw new Error(`DESIGN.md has no ${pattern}`);
    return Number.parseInt(found[1], 10);
  };

  it("agrees on the rail, the Stage minimum, the Inspector and the breakpoint", () => {
    expect(px(/^ {2}rail: (\d+)px/m)).toBe(RAIL_WIDTH);
    expect(px(/^ {2}stage-min: (\d+)px/m)).toBe(STAGE_MIN_WIDTH);
    expect(px(/^ {2}shell-inspector: (\d+)px/m)).toBe(INSPECTOR_WIDTH);
    expect(px(/inspector-overlay: (\d+)px/)).toBe(INSPECTOR_OVERLAY_BREAKPOINT);
  });
});
