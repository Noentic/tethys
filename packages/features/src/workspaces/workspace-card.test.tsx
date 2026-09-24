import { fireEvent, render, screen } from "@testing-library/react";
import type { CatalogWorkspace } from "@tethys/state";
import { workspaceCapabilityFixtures } from "@tethys/state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceCard } from "./workspace-card";

function workspace(partial: Partial<CatalogWorkspace> = {}): CatalogWorkspace {
  return {
    id: "tethys",
    name: "tethys",
    path: "~/Code/tethys",
    capabilities: workspaceCapabilityFixtures["git-remote"],
    trust: "trusted",
    permissionMode: "supervised",
    sessions: [],
    ...partial,
  };
}

const running = {
  id: "s0",
  providerId: "unknown",
  branchName: "fix-auth",
  status: "Running" as const,
  turnCount: 8,
  diffStat: null,
};

const awaiting = {
  id: "s1",
  providerId: "unknown",
  branchName: "review-diff",
  status: "AwaitingApproval" as const,
  turnCount: 3,
  diffStat: { added: 7, removed: 2 },
};

beforeEach(() => {
  localStorage.clear();
});

describe("workspace-card", () => {
  it("renders the session rows with their state, turn and diff", () => {
    render(
      <WorkspaceCard
        workspace={workspace({ sessions: [running, awaiting] })}
      />,
    );
    const rows = screen.getAllByTestId("workspace-card-thread");
    expect(rows).toHaveLength(2);
    expect(rows[0].dataset.state).toBe("running");
    expect(rows[1].dataset.state).toBe("awaiting_approval");
    expect(screen.getByText("T8")).toBeTruthy();
    expect(screen.getByText("+7")).toBeTruthy();
    expect(screen.getByText("−2")).toBeTruthy();
    expect(screen.getByText("2 threads (2 active)")).toBeTruthy();
  });

  it("overflows to a `more threads` row past three sessions", () => {
    render(
      <WorkspaceCard
        workspace={workspace({
          sessions: [
            running,
            { ...running, id: "s2", branchName: "b2" },
            { ...running, id: "s3", branchName: "b3" },
            { ...running, id: "s4", branchName: "b4" },
          ],
        })}
      />,
    );
    expect(screen.getAllByTestId("workspace-card-thread")).toHaveLength(3);
    expect(screen.getByTestId("workspace-card-more").textContent).toContain(
      "+1 more thread",
    );
  });

  it("shows attention as a wash and a warning mark, never a perimeter", () => {
    render(<WorkspaceCard workspace={workspace({ sessions: [awaiting] })} />);
    const card = screen.getByTestId("workspace-card");
    expect(card.className).toContain("wash-warning");
    expect(card.className).not.toContain("border-warning-soft");
    expect(screen.getByTestId("workspace-card-attention")).toBeTruthy();
  });

  it("lets attention and selection coexist without colliding", () => {
    render(
      <WorkspaceCard
        workspace={workspace({ sessions: [awaiting] })}
        selected
      />,
    );
    const card = screen.getByTestId("workspace-card");
    expect(card.className).toContain("wash-warning");
    expect(card.dataset.selected).toBe("true");
    expect(screen.getByRole("button", { name: "tethys" }).ariaCurrent).toBe(
      "true",
    );
  });

  it("carries no attention treatment when nothing is waiting", () => {
    render(<WorkspaceCard workspace={workspace()} />);
    expect(screen.getByTestId("workspace-card").className).not.toContain(
      "wash-warning",
    );
    expect(screen.queryByTestId("workspace-card-attention")).toBeNull();
  });

  it("pins and unpins the workspace from the star", () => {
    render(<WorkspaceCard workspace={workspace()} />);
    const star = screen.getByRole("button", { name: "Pin tethys" });
    expect(star.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(star);
    const unpin = screen.getByRole("button", { name: "Unpin tethys" });
    expect(unpin.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(unpin);
    expect(screen.getByRole("button", { name: "Pin tethys" })).toBeTruthy();
  });

  it("leads each thread row with the provider glyph, hiding the unknown placeholder", () => {
    const { rerender } = render(
      <WorkspaceCard workspace={workspace({ sessions: [running] })} />,
    );
    expect(screen.queryByTestId("provider-glyph")).toBeNull();

    rerender(
      <WorkspaceCard
        workspace={workspace({
          sessions: [{ ...running, providerId: "codex" }],
        })}
      />,
    );
    expect(screen.getByTestId("provider-glyph")).toBeTruthy();
  });

  it("opens a session row and the card body separately", () => {
    const onOpenThread = vi.fn();
    const onOpen = vi.fn();
    render(
      <WorkspaceCard
        workspace={workspace({ sessions: [running] })}
        onOpenThread={onOpenThread}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByTestId("workspace-card-thread"));
    expect(onOpenThread).toHaveBeenCalledWith("s0");
    fireEvent.click(screen.getByRole("button", { name: "tethys" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("renders the git-init upsell and the plain-mode hint only on a no-VCS card", () => {
    const { rerender } = render(
      <WorkspaceCard
        workspace={workspace({
          capabilities: workspaceCapabilityFixtures["no-git"],
        })}
      />,
    );
    expect(screen.getByTestId("git-init-upsell-chip")).toBeTruthy();
    expect(screen.getByText("Local folder · no VCS")).toBeTruthy();
    expect(screen.getByText("Plain mode (no branches)")).toBeTruthy();

    rerender(
      <WorkspaceCard
        workspace={workspace({
          capabilities: workspaceCapabilityFixtures["git-remote"],
        })}
      />,
    );
    expect(screen.queryByTestId("git-init-upsell-chip")).toBeNull();
    expect(screen.queryByText("Plain mode (no branches)")).toBeNull();
  });

  it("carries the git source glyph on a git folder and the folder glyph otherwise", () => {
    const { rerender } = render(<WorkspaceCard workspace={workspace()} />);
    expect(
      screen.getByTestId("workspace-card-source").querySelector("svg"),
    ).not.toBeNull();

    rerender(
      <WorkspaceCard
        workspace={workspace({
          capabilities: workspaceCapabilityFixtures["no-git"],
        })}
      />,
    );
    expect(
      screen.getByTestId("workspace-card-source").querySelector("svg"),
    ).not.toBeNull();
  });
});
