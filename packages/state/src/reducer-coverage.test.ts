//! Reducer coverage for the stable ACP update kinds that have no dedicated
//! surface (M1.17 U5): tool content chunks, session info, and unknown events.

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
