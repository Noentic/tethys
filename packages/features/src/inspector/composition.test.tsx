import { render, screen } from "@testing-library/react";
import type { TurnEventBody } from "@tethys/bindings";
import {
  clearAllSessionStoresForTesting,
  getOrCreateSessionStore,
  sessionReducer,
  workspaceCapabilityFixtures,
} from "@tethys/state";
import { clearRegistriesForTesting } from "@tethys/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InspectorClient } from "../client-context";
import { InspectorScreen } from "./InspectorScreen";
import { registerInspectorRenderers } from "./register";
import { TranscriptStage } from "./TranscriptStage";

const noopClient: InspectorClient = {
  permission: {
    respond: vi.fn().mockResolvedValue(undefined),
    elicitationRespond: vi.fn().mockResolvedValue(undefined),
  },
  events: { subscribe: vi.fn().mockResolvedValue(undefined) },
};

describe("Inspector composition (M1.7 U10)", () => {
  beforeEach(() => {
    clearAllSessionStoresForTesting();
    clearRegistriesForTesting();
    registerInspectorRenderers();
  });

  it("renders a full no-git turn with no diff section and no gap", () => {
    const entries = [
      {
        id: "m1",
        kind: "turn_message" as const,
        role: "Agent" as const,
        content: "Done",
        timestamp: 0,
      },
      {
        id: "t1",
        kind: "tool_call" as const,
        toolCallId: "t1",
        title: "Read file",
        status: "Completed" as const,
        locations: [],
        timestamp: 1,
      },
    ];
    render(
      <TranscriptStage
        entries={entries}
        capabilities={workspaceCapabilityFixtures["no-git"]}
      />,
    );
    expect(screen.getByText("Read file")).toBeTruthy();
    expect(screen.queryByTestId("turn-actions")).toBeNull();
  });

  it("offers View diff and Restore when the capability allows", () => {
    const entries = [
      {
        id: "t1",
        kind: "tool_call" as const,
        toolCallId: "t1",
        title: "Edit file",
        status: "Completed" as const,
        locations: [],
        timestamp: 1,
      },
    ];
    render(
      <TranscriptStage
        entries={entries}
        capabilities={workspaceCapabilityFixtures["git-remote"]}
      />,
    );
    expect(screen.getByRole("button", { name: "View diff" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
  });

  it("renders exactly one Earlier history divider", () => {
    const entries = [
      {
        id: "h1",
        kind: "turn_message" as const,
        role: "User" as const,
        content: "old",
        timestamp: 0,
        isHistory: true,
      },
      {
        id: "history-divider",
        kind: "history_divider" as const,
        label: "Earlier history (read-only)",
        timestamp: 0,
      },
      {
        id: "l1",
        kind: "turn_message" as const,
        role: "Agent" as const,
        content: "new",
        timestamp: 1,
      },
    ];
    render(
      <TranscriptStage
        entries={entries}
        capabilities={workspaceCapabilityFixtures["git-remote"]}
      />,
    );
    expect(
      screen.getAllByLabelText("Earlier history (read-only)"),
    ).toHaveLength(1);
  });

  it("renders no Inspector of its own: the shell's is the only one", () => {
    // The Inspector is a shell region. A private copy beside the transcript
    // rendered every slot twice, and gave the plan and ledger data the shell's
    // copy never received.
    const store = getOrCreateSessionStore("s-plan", "p", "ws");
    store.setState((state) =>
      sessionReducer(state, {
        type: "PlanUpsert",
        body: {
          plan_id: "default",
          plan: {
            entries: [
              { content: "step one", priority: "Medium", status: "InProgress" },
            ],
          },
        },
      } as TurnEventBody),
    );

    render(<InspectorScreen sessionId="s-plan" client={noopClient} />);
    expect(screen.queryByTestId("inspector-pane")).toBeNull();
    expect(screen.queryByText(/Plan · /)).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
