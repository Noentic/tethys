import type { SessionEntry, ToolCallEntry } from "@tethys/state";
import { describe, expect, it } from "vitest";
import { groupToolRuns, summarizeRun } from "./group-runs";

function call(
  id: string,
  kind: ToolCallEntry["toolKind"],
  status: ToolCallEntry["status"] = "Completed",
): ToolCallEntry {
  return {
    id,
    kind: "tool_call",
    toolCallId: id,
    title: id,
    status,
    toolKind: kind,
    locations: [],
    timestamp: 0,
  };
}

function message(id: string): SessionEntry {
  return {
    id,
    kind: "turn_message",
    role: "Agent",
    content: "",
    timestamp: 0,
  };
}

describe("groupToolRuns (M1.7 U15)", () => {
  it("splits 30 calls separated by two messages into three runs", () => {
    const entries: SessionEntry[] = [];
    for (let index = 0; index < 10; index += 1) {
      entries.push(call(`a${index}`, "read"));
    }
    entries.push(message("m1"));
    for (let index = 0; index < 10; index += 1) {
      entries.push(call(`b${index}`, "execute"));
    }
    entries.push(message("m2"));
    for (let index = 0; index < 10; index += 1) {
      entries.push(call(`c${index}`, "edit"));
    }

    const segments = groupToolRuns(entries);
    const runs = segments.filter((segment) => segment.type === "run");
    expect(runs).toHaveLength(3);
  });

  it("summarizes counts in first-seen order with the first three and +N", () => {
    const entries: SessionEntry[] = [
      call("r1", "read"),
      call("r2", "read"),
      call("r3", "read"),
      call("e1", "execute"),
      call("e2", "execute"),
      call("s1", "search"),
      call("f1", "fetch"),
      call("t1", "think"),
    ];
    const [run] = groupToolRuns(entries);
    expect(run.type).toBe("run");
    if (run.type !== "run") {
      return;
    }
    expect(run.run.summary).toBe(
      "Read 3 files · ran 2 commands · 1 search · +2 more",
    );
    expect(run.run.counts.map((count) => count.surface)).toEqual([
      "read",
      "shell",
      "search",
      "web_fetch",
      "think",
    ]);
  });

  it("keeps a single tool call as its own entry", () => {
    const segments = groupToolRuns([call("only", "read")]);
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe("entry");
  });

  it("flags failed and live members", () => {
    const [segment] = groupToolRuns([
      call("a", "read", "Failed"),
      call("b", "execute", "Pending"),
    ]);
    expect(segment.type).toBe("run");
    if (segment.type === "run") {
      expect(segment.run.hasFailure).toBe(true);
      expect(segment.run.isLive).toBe(true);
    }
  });

  it("summarizeRun with no counts is empty", () => {
    expect(summarizeRun([])).toBe("");
  });
});
