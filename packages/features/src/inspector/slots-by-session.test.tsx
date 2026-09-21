import { render, screen } from "@testing-library/react";
import type { TurnEventBody } from "@tethys/bindings";
import {
  getOrCreateSessionStore,
  type PlanEntry,
  type SessionEntry,
  sessionReducer,
  type ToolCallEntry,
} from "@tethys/state";
import { clearRegistriesForTesting, getAllInspectorSlots } from "@tethys/ui";
import { beforeEach, describe, expect, it } from "vitest";
import { registerInspectorRenderers } from "./register";

// The shell mounts each Inspector slot with only a `sessionId`. A slot that
// needs anything else to show its content renders empty there, which is how the
// plan and the ledger came to depend on a private copy of the Inspector.

const SESSION = "s-slots";

function readCall(id: string): ToolCallEntry {
  return {
    id,
    kind: "tool_call",
    toolCallId: id,
    title: id,
    status: "Completed",
    toolKind: "read",
    locations: [{ path: `${id}.rs`, line: 1 }],
    timestamp: 0,
  };
}

const plan: PlanEntry = {
  id: "plan-1",
  kind: "plan",
  planId: "plan-1",
  timestamp: 0,
  steps: [
    { content: "Find the expiry bug", priority: "High", status: "Completed" },
    { content: "Write the fix", priority: "High", status: "InProgress" },
    { content: "Run the tests", priority: "Medium", status: "Pending" },
  ],
};

function seed(entries: SessionEntry[]): void {
  getOrCreateSessionStore(SESSION).setState((prev) => ({
    ...prev,
    entries,
    liveEntries: entries,
  }));
}

describe("inspector slots render from the session id alone", () => {
  beforeEach(() => {
    clearRegistriesForTesting();
    registerInspectorRenderers();
    seed([plan, readCall("a"), readCall("b")]);
  });

  it("registers the summary, plan and activity ledger", () => {
    expect(getAllInspectorSlots().map(([id]) => id)).toEqual([
      "summary",
      "plan",
      "activity-ledger",
    ]);
  });

  it("shows the live plan without being handed its steps", () => {
    const [, Plan] = getAllInspectorSlots().find(([id]) => id === "plan") ?? [];
    expect(Plan).toBeDefined();
    if (!Plan) return;
    render(<Plan sessionId={SESSION} />);
    expect(screen.getByText(/Plan · 1\/3 complete/)).toBeDefined();
    expect(screen.getByText("Write the fix")).toBeDefined();
  });

  it("counts the session's activity without being handed its entries", () => {
    const [, Ledger] =
      getAllInspectorSlots().find(([id]) => id === "activity-ledger") ?? [];
    expect(Ledger).toBeDefined();
    if (!Ledger) return;
    render(<Ledger sessionId={SESSION} />);
    expect(screen.getByTestId("activity-ledger")).toBeDefined();
    expect(screen.queryByTestId("activity-ledger-empty")).toBeNull();
  });

  it("shows a plan that arrived as a real PlanUpsert event", () => {
    const store = getOrCreateSessionStore("s-plan-event", "p", "ws");
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
    const [, Plan] = getAllInspectorSlots().find(([id]) => id === "plan") ?? [];
    if (!Plan) throw new Error("plan slot missing");
    render(<Plan sessionId="s-plan-event" />);
    expect(screen.getByText("Plan · 0/1 complete")).toBeDefined();
  });

  it("still lets a caller override with explicit data", () => {
    const [, Plan] = getAllInspectorSlots().find(([id]) => id === "plan") ?? [];
    if (!Plan) throw new Error("plan slot missing");
    render(
      <Plan
        sessionId={SESSION}
        data={[{ content: "Only this", priority: "Low", status: "Pending" }]}
      />,
    );
    expect(screen.getByText("Only this")).toBeDefined();
    expect(screen.queryByText("Write the fix")).toBeNull();
  });

  it("says so plainly for a session with no plan", () => {
    const [, Plan] = getAllInspectorSlots().find(([id]) => id === "plan") ?? [];
    if (!Plan) throw new Error("plan slot missing");
    render(<Plan sessionId="a-session-that-never-planned" />);
    expect(screen.getByText("No plan yet")).toBeDefined();
  });
});
