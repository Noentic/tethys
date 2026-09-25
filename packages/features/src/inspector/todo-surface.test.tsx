import { fireEvent, render, screen } from "@testing-library/react";
import type {
  ElicitationEntry,
  PlanEntry,
  PlanStep,
  SessionEntry,
  ToolCallEntry,
} from "@tethys/state";
import { describe, expect, it } from "vitest";
import { PlanCardRenderer, TodoPin } from "./renderers/plan-panel";
import { recordedElsewhere } from "./TranscriptStage";

function plan(statuses: PlanStep["status"][]): PlanEntry {
  return {
    id: "plan-default",
    kind: "plan",
    planId: "default",
    timestamp: 0,
    steps: statuses.map((status, index) => ({
      content: `step ${index + 1}`,
      priority: "Medium",
      status,
    })),
  };
}

function call(id: string, patch: Partial<ToolCallEntry>): ToolCallEntry {
  return {
    id,
    kind: "tool_call",
    toolCallId: id,
    title: id,
    status: "Completed",
    locations: [],
    timestamp: 0,
    ...patch,
  };
}

describe("todo pin", () => {
  it("shows progress and the step in progress, and the list on click", () => {
    render(
      <TodoPin entries={[plan(["Completed", "InProgress", "Pending"])]} />,
    );
    const pin = screen.getByRole("button");
    expect(pin.textContent).toContain("1/3");
    expect(pin.textContent).toContain("step 2");
    fireEvent.click(pin);
    expect(screen.getByText("step 3")).toBeTruthy();
  });

  it("is gone when there is no list or every step is done", () => {
    const { container, rerender } = render(<TodoPin entries={[]} />);
    expect(container.innerHTML).toBe("");
    rerender(<TodoPin entries={[plan(["Completed", "Completed"])]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("todo card", () => {
  it("folds a finished list to its count", () => {
    render(<PlanCardRenderer entry={plan(["Completed", "Completed"])} />);
    expect(screen.getByRole("button").textContent).toContain("2/2 done");
    expect(screen.queryByText("step 1")).toBeNull();
  });
});

describe("records kept by another card", () => {
  it("hides a todo write behind the plan and a question behind its form", () => {
    const question: ElicitationEntry = {
      id: "elicit-1",
      kind: "elicitation",
      reqId: "elicit-1",
      timestamp: 0,
      request: {
        req_id: "elicit-1",
        title: "Which?",
        description: null,
        url: null,
        fields: [],
        tool_call_id: "ask",
      },
    };
    const entries: SessionEntry[] = [
      call("todo", { surface: "todo" }),
      call("ask", { surface: "question" }),
      call("ask-2", { surface: "question" }),
      call("read", { toolKind: "read" }),
      plan(["Pending"]),
      question,
    ];
    expect([...recordedElsewhere(entries)]).toEqual(["todo", "ask"]);
    expect([...recordedElsewhere(entries.slice(1, 4))]).toEqual([]);
  });
});
