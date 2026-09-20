import { fireEvent, render, screen } from "@testing-library/react";
import type { SessionEntry, ToolCallEntry } from "@tethys/state";
import { describe, expect, it } from "vitest";
import { indexChildren } from "./nest-children";
import { SubagentCard } from "./renderers/subagent-card";
import { ToolOriginTag } from "./renderers/tool-origin-tag";

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

describe("tool-origin-tag (M1.7 U16)", () => {
  it("renders mcp, skill and subagent tags, but nothing for builtin", () => {
    const { rerender } = render(
      <ToolOriginTag origin={{ kind: "mcp", server: "filesystem" }} />,
    );
    expect(screen.getByTestId("tool-origin-tag").textContent).toBe(
      "mcp · filesystem",
    );
    rerender(<ToolOriginTag origin={{ kind: "skill", name: "pdf" }} />);
    expect(screen.getByTestId("tool-origin-tag").textContent).toBe(
      "skill · pdf",
    );
    rerender(<ToolOriginTag origin={{ kind: "builtin" }} />);
    expect(screen.queryByTestId("tool-origin-tag")).toBeNull();
    rerender(<ToolOriginTag origin={null} />);
    expect(screen.queryByTestId("tool-origin-tag")).toBeNull();
  });

  it("truncates a long server name and keeps the full name as its tooltip", () => {
    render(
      <ToolOriginTag
        origin={{ kind: "mcp", server: "a-very-long-server-name" }}
      />,
    );
    const tag = screen.getByTestId("tool-origin-tag");
    expect(tag.textContent).toContain("…");
    expect(tag.getAttribute("title")).toBe("a-very-long-server-name");
  });

  it("never guesses origin from a built-in call's title", () => {
    render(<ToolOriginTag origin={undefined} />);
    expect(screen.queryByTestId("tool-origin-tag")).toBeNull();
  });
});

describe("subagent-card (M1.7 U16)", () => {
  it("nests children in order and rolls them up", () => {
    const parent = call("A", {
      origin: { kind: "subagent" },
      title: "Subagent",
    });
    const children = [
      call("c1", { parentToolCallId: "A" }),
      call("c2", { parentToolCallId: "A" }),
      call("c3", { parentToolCallId: "A" }),
    ];
    const index = indexChildren([parent, ...children]);
    render(<SubagentCard entry={parent} index={index} />);
    expect(screen.getByText("3 tool calls")).toBeTruthy();
    const card = screen.getByRole("button");
    expect(card.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders a grandchild flat with a depth 2 marker", () => {
    const parent = call("A", { origin: { kind: "subagent" } });
    const child = call("B", { parentToolCallId: "A" });
    const grandchild = call("C", { parentToolCallId: "B" });
    const index = indexChildren([parent, child, grandchild]);
    render(<SubagentCard entry={parent} index={index} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("depth 2")).toBeTruthy();
  });

  it("opens and rings the dot when a child awaits approval", () => {
    const parent = call("A", { origin: { kind: "subagent" } });
    const child = call("B", { parentToolCallId: "A", status: "Pending" });
    const index = indexChildren([parent, child]);
    render(<SubagentCard entry={parent} index={index} />);
    const card = screen.getByRole("button");
    expect(card.getAttribute("aria-expanded")).toBe("true");
    expect(card.textContent).toContain("awaiting permission");
  });

  it("renders an orphan top-level with a capability notice", () => {
    const orphan: SessionEntry = call("B", { parentToolCallId: "missing" });
    const index = indexChildren([orphan]);
    expect(index.orphanIds.has("B")).toBe(true);
  });
});
