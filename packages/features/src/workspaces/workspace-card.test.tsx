import { render, screen } from "@testing-library/react";
import type { CatalogWorkspace } from "@tethys/state";
import { workspaceCapabilityFixtures } from "@tethys/state";
import { describe, expect, it } from "vitest";
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

const awaiting = {
  id: "s1",
  providerId: "codex",
  branchName: "feature/JIRA-4821-fix-auth-token-refresh",
  status: "AwaitingApproval" as const,
  turnCount: 3,
  diffStat: { added: 7, removed: 2 },
};

describe("workspace-card", () => {
  it("renders both canvas modes and their accessible summary", () => {
    const { rerender } = render(
      <WorkspaceCard
        workspace={workspace({
          capabilities: workspaceCapabilityFixtures["git-remote"],
          sessions: [awaiting],
        })}
      />,
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "session",
    );

    rerender(
      <WorkspaceCard
        workspace={workspace({
          capabilities: workspaceCapabilityFixtures["no-git"],
          sessions: [],
        })}
      />,
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Single-session folder",
    );
  });

  it("marks the selected card with the accent bar and aria-current", () => {
    render(<WorkspaceCard workspace={workspace()} selected />);
    const card = screen.getByTestId("workspace-card");
    expect(card.dataset.selected).toBe("true");
    expect(card.className).toContain("before:bg-(--tethys-accent-focus)");
    expect(screen.getByRole("button", { name: "tethys" }).ariaCurrent).toBe(
      "true",
    );
  });

  it("renders the git-init upsell only on a non-git card", () => {
    const { rerender } = render(
      <WorkspaceCard
        workspace={workspace({
          capabilities: workspaceCapabilityFixtures["no-git"],
        })}
      />,
    );
    expect(screen.getByTestId("git-init-upsell-chip")).toBeTruthy();

    rerender(
      <WorkspaceCard
        workspace={workspace({
          capabilities: workspaceCapabilityFixtures["git-remote"],
        })}
      />,
    );
    expect(screen.queryByTestId("git-init-upsell-chip")).toBeNull();
  });

  it("renders the DESIGN source label for each VCS shape", () => {
    const labels: Array<[CatalogWorkspace["capabilities"], string]> = [
      [workspaceCapabilityFixtures["git-remote"], "Git · GitHub"],
      [workspaceCapabilityFixtures["git-local"], "Git · local"],
      [workspaceCapabilityFixtures["no-git"], "Folder · no VCS"],
    ];
    for (const [capabilities, label] of labels) {
      const { unmount } = render(
        <WorkspaceCard workspace={workspace({ capabilities })} />,
      );
      expect(screen.getByText(label)).toBeTruthy();
      unmount();
    }
  });
});
