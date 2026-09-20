import { fireEvent, render, screen } from "@testing-library/react";
import type { CatalogSession } from "@tethys/state";
import { describe, expect, it } from "vitest";
import { SessionItemChip } from "./session-item-chip";

function session(
  status: CatalogSession["status"],
  branchName: string,
): CatalogSession {
  return {
    id: "s1",
    providerId: "claude-code",
    branchName,
    status,
    turnCount: 8,
    diffStat: { added: 34, removed: 12 },
  };
}

describe("session-item-chip", () => {
  it("truncates the 40-char branch and exposes the full name as a tooltip", () => {
    const branch = "feature/JIRA-4821-fix-auth-token-refresh";
    render(<SessionItemChip session={session("Running", branch)} />);
    const branchText = screen.getByText(branch);
    expect(branchText.className).toContain("truncate");
    expect(branchText.closest("button")?.style.maxWidth).toBe("240px");
    fireEvent.mouseEnter(branchText.closest("div") as HTMLElement);
    expect(screen.getByRole("tooltip").textContent).toBe(branch);
  });

  it("never renders below minWidth or above maxWidth", () => {
    render(<SessionItemChip session={session("Running", "feature/x")} />);
    const chip = screen.getByTestId("session-item-chip");
    expect(chip.style.minWidth).toBe("96px");
    expect(chip.style.maxWidth).toBe("240px");
  });

  it("marks awaiting with a ring and running with a disc", () => {
    const { rerender } = render(
      <SessionItemChip session={session("AwaitingApproval", "feature/a")} />,
    );
    expect(screen.getByTestId("session-item-chip").dataset.status).toBe(
      "awaiting_approval",
    );
    expect(screen.getByTestId("status-marker").style.border).toContain("solid");

    rerender(<SessionItemChip session={session("Running", "feature/a")} />);
    expect(screen.getByTestId("session-item-chip").dataset.status).toBe(
      "running",
    );
    expect(screen.getByTestId("status-marker").style.border).toBe("");
    expect(screen.getByTestId("status-marker").style.backgroundColor).not.toBe(
      "",
    );
  });

  it("drops the turn count first, then the diff stat", () => {
    const { rerender } = render(
      <SessionItemChip session={session("Running", "feature/a")} width={200} />,
    );
    expect(screen.getByTestId("chip-turn")).toBeTruthy();
    expect(screen.getByTestId("chip-diff")).toBeTruthy();

    rerender(
      <SessionItemChip session={session("Running", "feature/a")} width={150} />,
    );
    expect(screen.queryByTestId("chip-turn")).toBeNull();
    expect(screen.getByTestId("chip-diff")).toBeTruthy();

    rerender(
      <SessionItemChip session={session("Running", "feature/a")} width={100} />,
    );
    expect(screen.queryByTestId("chip-turn")).toBeNull();
    expect(screen.queryByTestId("chip-diff")).toBeNull();
    expect(screen.getByText("feature/a")).toBeTruthy();
  });

  it("emits no waiting_approval literal", () => {
    render(<SessionItemChip session={session("AwaitingApproval", "x")} />);
    expect(screen.queryByText(/waiting_approval/)).toBeNull();
  });
});
