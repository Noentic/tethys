//! Reducer coverage for ACP updates that must remain visible to the UI.

import { describe, expect, it } from "vitest";
import {
  createInitialSessionState,
  type SessionEntry,
  sessionReducer,
} from "./reducers";

function entry(id: string, entries: SessionEntry[]): SessionEntry | undefined {
  return entries.find((item) => item.id === id);
}

describe("stable update coverage", () => {
  it("materializes tool output that arrives before its declaration", () => {
    let state = createInitialSessionState("s-1", "p-1", "ws-1");
    state = sessionReducer(
      state,
      {
        type: "ToolCallContentChunk",
        body: { tool_call_id: "tool-early", item: { Text: "output" } },
      },
      1,
    );

    const tool = entry("tool-early", state.liveEntries);
    expect(tool?.kind).toBe("tool_call");
    expect(tool && "output" in tool ? tool.output : undefined).toBe("output");
  });

  it("appends a tool content chunk to the matching tool entry", () => {
    let state = createInitialSessionState("s-1", "p-1", "ws-1");
    state = sessionReducer(
      state,
      {
        type: "ToolCallUpsert",
        body: {
          tool_call_id: "tool-1",
          patch: {
            title: "Read file",
            status: "Executing",
            kind: null,
            origin: null,
            parent_tool_call_id: null,
            locations: [],
            input: null,
            output: null,
          },
        },
      },
      1,
    );
    state = sessionReducer(
      state,
      {
        type: "ToolCallContentChunk",
        body: { tool_call_id: "tool-1", item: { Text: "line one" } },
      },
      2,
    );
    state = sessionReducer(
      state,
      {
        type: "ToolCallContentChunk",
        body: { tool_call_id: "tool-1", item: { Text: "line two" } },
      },
      3,
    );

    const tool = entry("tool-1", state.liveEntries);
    expect(tool?.kind).toBe("tool_call");
    expect(tool && "output" in tool ? tool.output : undefined).toBe(
      "line oneline two",
    );
  });

  it("updates the session title from a session-info update", () => {
    let state = createInitialSessionState("s-1", "p-1", "ws-1");
    state = sessionReducer(
      state,
      {
        type: "SessionInfo",
        body: { title: "Renamed thread", updated_at: null },
      },
      1,
    );
    expect(state.title).toBe("Renamed thread");
    expect(state.seq).toBe(1);
  });

  it("keeps file writes, checkpoints, and compaction visible", () => {
    let state = createInitialSessionState("s-1", "p-1", "ws-1");
    state = sessionReducer(
      state,
      {
        type: "FileWrite",
        body: {
          path: "src/main.ts",
          before: null,
          after: "export {}",
          via: "AcpFs",
        },
      },
      1,
    );
    state = sessionReducer(
      state,
      {
        type: "Checkpoint",
        body: { oid: "abc123", kind: "TurnEnd" },
      },
      2,
    );
    state = sessionReducer(
      state,
      { type: "Compaction", body: { summary: "Older context removed" } },
      3,
    );

    expect(state.liveEntries.map((item) => item.kind)).toEqual([
      "file_write",
      "checkpoint",
      "turn_notice",
    ]);
    const notice = state.liveEntries[2];
    expect(notice?.kind).toBe("turn_notice");
    expect(
      notice && "noticeKind" in notice ? notice.noticeKind : undefined,
    ).toBe("compaction");
    expect(notice && "summary" in notice ? notice.summary : undefined).toBe(
      "Older context removed",
    );
  });

  it("applies and clears session goal snapshots", () => {
    let state = createInitialSessionState("s-1", "p-1", "ws-1");
    state = sessionReducer(
      state,
      {
        type: "SessionInfo",
        body: {
          title: null,
          updated_at: null,
          goal: {
            type: "Set",
            value: {
              objective: "Ship the change",
              status: "active",
              iterations: 2,
              last_reason: null,
              created_at: null,
              metadata: "{}",
            },
          },
        },
      },
      1,
    );
    expect(state.goal?.objective).toBe("Ship the change");

    state = sessionReducer(
      state,
      {
        type: "SessionInfo",
        body: { title: null, updated_at: null, goal: { type: "Clear" } },
      },
      2,
    );
    expect(state.goal).toBeNull();
  });

  it("keeps an unknown update inspectable instead of dropping it", () => {
    let state = createInitialSessionState("s-1", "p-1", "ws-1");
    state = sessionReducer(
      state,
      { type: "Unknown", body: { raw: '{"future":"update"}' } },
      7,
    );
    const generic = state.liveEntries.find((item) => item.kind === "unknown") as
      | { data?: unknown }
      | undefined;
    expect(generic).toBeDefined();
    expect(JSON.stringify(generic?.data)).toContain("future");
    expect(state.seq).toBe(7);
  });
});
