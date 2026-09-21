import { fireEvent, render, screen } from "@testing-library/react";
import type { CatalogSession } from "@tethys/state";
import { describe, expect, it, vi } from "vitest";
import { SessionItemRow } from "./session-item-row";

function session(partial: Partial<CatalogSession> = {}): CatalogSession {
  return {
    id: "s1",
    providerId: "claude-code",
    branchName: "fix-auth",
    status: "Running",
    turnCount: 8,
    diffStat: { added: 34, removed: 12 },
    ...partial,
  };
}

describe("session-item-row", () => {
  it("renders the branch, turn tag and two-colour diff", () => {
    render(<SessionItemRow session={session()} />);
    const row = screen.getByTestId("session-item-row");
    expect(row.dataset.status).toBe("running");
    expect(screen.getByText("fix-auth")).toBeTruthy();
    expect(screen.getByText("T8")).toBeTruthy();
    expect(screen.getByText("+34")).toBeTruthy();
    expect(screen.getByText("−12")).toBeTruthy();
  });

  it("omits the turn tag and diff when the session reports neither", () => {
    render(
      <SessionItemRow session={session({ turnCount: 0, diffStat: null })} />,
    );
    expect(screen.queryByText("T0")).toBeNull();
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it("carries the state's own dot and names it for assistive tech", () => {
    render(<SessionItemRow session={session({ status: "Interrupted" })} />);
    const row = screen.getByTestId("session-item-row");
    expect(row.dataset.status).toBe("interrupted");
    expect(row.getAttribute("aria-label")).toContain("interrupted");
  });

  it("hides the provider glyph while the wire reports no provider", () => {
    const { rerender } = render(
      <SessionItemRow session={session({ providerId: "unknown" })} />,
    );
    expect(screen.queryByTestId("provider-glyph")).toBeNull();
    rerender(<SessionItemRow session={session()} />);
    expect(screen.getByTestId("provider-glyph")).toBeTruthy();
  });

  it("opens the thread on click", () => {
    const onOpen = vi.fn();
    render(<SessionItemRow session={session()} onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId("session-item-row"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
