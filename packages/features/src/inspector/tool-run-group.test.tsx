import { fireEvent, render, screen } from "@testing-library/react";
import type { ToolCallEntry } from "@tethys/state";
import { describe, expect, it } from "vitest";
import { buildToolRun } from "./group-runs";
import { ToolAccordionRenderer } from "./renderers/tool-accordion";
import { ToolRunGroup } from "./renderers/tool-run-group";

function call(
  id: string,
  overrides: Partial<ToolCallEntry> = {},
): ToolCallEntry {
  return {
    id,
    kind: "tool_call",
    toolCallId: id,
    title: id,
    status: "Completed",
    toolKind: "read",
    locations: [],
    timestamp: 0,
    ...overrides,
  };
}

describe("tool-run-group (M1.7 U15)", () => {
  it("renders one summary row with aria-expanded/controls", () => {
    const run = buildToolRun([call("a"), call("b")]);
    render(<ToolRunGroup run={run} />);
    const row = screen.getByRole("button");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(row.getAttribute("aria-controls")).toBeTruthy();
    fireEvent.click(row);
    expect(screen.getByText("a")).toBeTruthy();
    expect(screen.getByText("b")).toBeTruthy();
  });

  it("sets aria-busy and shows the in-flight title while live", () => {
    const run = buildToolRun([
      call("a"),
      call("b", { status: "Executing", title: "Running tests" }),
    ]);
    render(<ToolRunGroup run={run} />);
    const row = screen.getByRole("button");
    expect(row.getAttribute("aria-busy")).toBe("true");
    expect(row.textContent).toContain("Running tests");
  });

  it("opens itself with the failed member expanded", () => {
    const run = buildToolRun([
      call("ok"),
      call("bad", { status: "Failed", title: "Boom" }),
    ]);
    render(<ToolRunGroup run={run} />);
    expect(screen.getByText("Boom")).toBeTruthy();
  });

  it("stays folded while a member waits: the request docks above the composer", () => {
    const run = buildToolRun([call("ok"), call("wait", { status: "Pending" })]);
    render(<ToolRunGroup run={run} />);
    const row = screen.getByTestId("tool-run-group-row");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
  });

  it("starts folded and keeps the reader's choice through streaming updates", () => {
    const { rerender } = render(
      <ToolAccordionRenderer entry={call("a", { status: "Pending" })} />,
    );
    const row = () => screen.getByRole("button");
    expect(row().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(row());
    expect(row().getAttribute("aria-expanded")).toBe("true");
    rerender(
      <ToolAccordionRenderer
        entry={call("a", { status: "Executing", output: "streaming" })}
      />,
    );
    expect(row().getAttribute("aria-expanded")).toBe("true");
  });
});
