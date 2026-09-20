import { render, screen } from "@testing-library/react";
import type { CatalogSession } from "@tethys/state";
import { describe, expect, it } from "vitest";
import { SessionTopologyCanvas } from "./session-topology-canvas";

function session(
  id: string,
  status: CatalogSession["status"],
  branchName = `feature/${id}`,
): CatalogSession {
  return {
    id,
    providerId: "claude-code",
    branchName,
    status,
    turnCount: 1,
    diffStat: { added: 1, removed: 0 },
  };
}

describe("session-topology-canvas", () => {
  it("renders git-topology mode with an accessible node-state summary", () => {
    render(
      <SessionTopologyCanvas
        vcs={{ kind: "git-remote", host: "github" }}
        sessions={[
          session("run", "Running", "fix-auth"),
          session("await", "AwaitingApproval", "api-v2"),
        ]}
      />,
    );
    const canvas = screen.getByRole("img");
    expect(canvas.getAttribute("aria-label")).toContain("2 sessions");
    expect(canvas.getAttribute("aria-label")).toContain("awaiting approval");
    const nodes = screen.getAllByTestId("topology-node");
    expect(nodes.length).toBe(3); // trunk + two branches
  });

  it("renders single-node mode for a non-git folder", () => {
    render(<SessionTopologyCanvas vcs={{ kind: "none" }} sessions={[]} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Single-session folder",
    );
    expect(screen.getAllByTestId("topology-node")).toHaveLength(1);
  });

  it("draws awaiting as a ring and running as a disc", () => {
    render(
      <SessionTopologyCanvas
        vcs={{ kind: "git-remote", host: "github" }}
        sessions={[
          session("run", "Running"),
          session("await", "AwaitingApproval"),
        ]}
      />,
    );
    const nodes = screen.getAllByTestId("topology-node");
    const awaiting = nodes.find(
      (node) => node.getAttribute("data-state") === "awaiting_approval",
    );
    const running = nodes.find(
      (node) => node.getAttribute("data-state") === "running",
    );
    expect(awaiting?.getAttribute("data-shape")).toBe("ring");
    expect(running?.getAttribute("data-shape")).toBe("disc");
  });
});
