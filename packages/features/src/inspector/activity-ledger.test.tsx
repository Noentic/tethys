import { fireEvent, render, screen } from "@testing-library/react";
import type { SessionEntry, ToolCallEntry } from "@tethys/state";
import { describe, expect, it } from "vitest";
import { ActivityLedger } from "./activity-ledger";
import { countActivity } from "./ledger-counts";

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
    locations: [{ path: `${id}.rs`, line: 1 }],
    timestamp: 0,
    ...overrides,
  };
}

function userMessage(id: string): SessionEntry {
  return {
    id,
    kind: "turn_message",
    role: "User",
    content: "",
    timestamp: 0,
  };
}

describe("activity-ledger (M1.7 U18)", () => {
  it("counts a fixture by kind and origin", () => {
    const entries: SessionEntry[] = [
      ...Array.from({ length: 12 }, (_, i) => call(`r${i}`)),
      ...Array.from({ length: 5 }, (_, i) =>
        call(`e${i}`, { toolKind: "execute", title: `cmd ${i}` }),
      ),
      call("m1", { origin: { kind: "mcp", server: "filesystem" } }),
      call("m2", { origin: { kind: "mcp", server: "github" } }),
      call("m3", { origin: { kind: "mcp", server: "filesystem" } }),
      ...Array.from({ length: 2 }, (_, i) =>
        call(`s${i}`, { toolKind: "search", title: `search ${i}` }),
      ),
    ];
    const counts = countActivity(entries);
    const byId = Object.fromEntries(
      counts.rows.map((row) => [row.id, row.count]),
    );
    expect(byId.read).toBe(12);
    expect(byId.execute).toBe(5);
    expect(byId.mcp).toBe(3);
    expect(byId.search).toBe(2);
    // A kind with zero calls is omitted.
    expect(byId.fetch).toBeUndefined();
  });

  it("expands a row in place with links to the transcript entries", () => {
    render(<ActivityLedger data={[call("r1"), call("r2")]} />);
    const row = screen.getByRole("button", { name: /Files read/ });
    fireEvent.click(row);
    const link = screen.getByRole("link", { name: "r1.rs" });
    expect(link.getAttribute("href")).toBe("#r1");
  });

  it("reads No tool calls yet on a fresh session", () => {
    render(<ActivityLedger data={[]} />);
    expect(screen.getByTestId("activity-ledger-empty")).toBeTruthy();
  });

  it("narrows to the current turn", () => {
    const entries: SessionEntry[] = [
      call("old"),
      userMessage("u1"),
      call("new"),
    ];
    render(<ActivityLedger data={entries} />);
    expect(
      screen.getByRole("button", { name: /Files read/ }).textContent,
    ).toContain("2");
    fireEvent.click(screen.getByRole("switch", { name: "This turn" }));
    expect(
      screen.getByRole("button", { name: /Files read/ }).textContent,
    ).toContain("1");
  });

  it("shows skill and subagent rows only where origin is present", () => {
    const counts = countActivity([
      call("a", { origin: { kind: "skill", name: "pdf" } }),
      call("b", { origin: { kind: "subagent" } }),
    ]);
    const ids = counts.rows.map((row) => row.id);
    expect(ids).toContain("skill");
    expect(ids).toContain("subagent");
  });
});
