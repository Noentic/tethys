import { render, screen } from "@testing-library/react";
import type { CatalogSession } from "@tethys/state";
import { describe, expect, it } from "vitest";
import { SessionItemRow } from "./session-item-row";

function session(status: CatalogSession["status"]): CatalogSession {
  return {
    id: "s1",
    providerId: "claude-code",
    branchName: "feat/auth",
    status,
    turnCount: 3,
    diffStat: { added: 4, removed: 1 },
  };
}

describe("session-item-row", () => {
  it("names each stopped state in words beside its dot", () => {
    for (const [status, word] of [
      ["Interrupted", "Interrupted"],
      ["Suspended", "Suspended"],
      ["Archived", "Archived"],
    ] as const) {
      const { unmount } = render(<SessionItemRow session={session(status)} />);
      expect(screen.getByText(word)).toBeDefined();
      unmount();
    }
  });

  it("adds no state word for a live or idle session", () => {
    for (const [status, word] of [
      ["Running", "Running"],
      ["Idle", "Idle"],
    ] as const) {
      const { unmount } = render(<SessionItemRow session={session(status)} />);
      expect(screen.queryByText(word)).toBeNull();
      unmount();
    }
  });

  it("marks an awaiting row with a wash and a 2px left rule, not a perimeter", () => {
    render(<SessionItemRow session={session("AwaitingApproval")} />);
    const row = screen.getByTestId("session-item-row");
    expect(row.className).toContain("wash-warning");
    expect(row.className).toContain("border-l-2");
    expect(row.className).toContain("border-l-(--tethys-status-warning)");
    expect(row.className).not.toContain("border-warning-soft");
  });

  it("leaves a running row on the plain hairline", () => {
    render(<SessionItemRow session={session("Running")} />);
    const row = screen.getByTestId("session-item-row");
    expect(row.className).not.toContain("wash-warning");
    expect(row.className).not.toContain("border-l-2");
  });
});
