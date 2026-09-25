//! Reducer coverage for ACP updates that must remain visible to the UI.

import { describe, expect, it } from "vitest";
import {
  createInitialSessionState,
  type SessionEntry,
  sessionReducer,
  type ToolCallEntry,
  type TurnMessageEntry,
} from "./reducers";

function entry(id: string, entries: SessionEntry[]): SessionEntry | undefined {
  return entries.find((item) => item.id === id);
}

function isToolCall(entry: SessionEntry | undefined): entry is ToolCallEntry {
  return entry?.kind === "tool_call";
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

  it("keeps async task identity and structured diff statistics", () => {
    let state = createInitialSessionState("s-1", "p-1", "ws-1");
    state = sessionReducer(
      state,
      {
        type: "ToolCallUpsert",
        body: {
          tool_call_id: "tool-1",
          patch: {
            title: "Edit file",
            status: "Executing",
            kind: null,
            input: null,
            output: null,
            async_task_id: "task-1",
          },
        },
      },
      1,
    );
    state = sessionReducer(
      state,
      {
        type: "ToolCallContentChunk",
        body: {
          tool_call_id: "tool-1",
          item: {
            Diff: {
              path: "src/main.rs",
              patch: "@@ -1 +1 @@",
              stats: { added: 3, removed: 1 },
              metadata: '{"source":"codex"}',
            },
          },
        },
      },
      2,
    );

    const tool = entry("tool-1", state.liveEntries);
    expect(tool?.kind).toBe("tool_call");
    if (isToolCall(tool)) {
      expect(tool.asyncTaskId).toBe("task-1");
      expect(tool.diffStats).toEqual({
        "src/main.rs": { added: 3, removed: 1 },
      });
      expect(tool.metadata).toBe('{"source":"codex"}');
      // The patch stays a diff, never text appended to the output.
      expect(tool.diffs).toEqual([
        { path: "src/main.rs", patch: "@@ -1 +1 @@" },
      ]);
      expect(tool.output ?? null).toBeNull();
    }
  });

  it("remembers the terminal a tool call ran in", () => {
    let state = createInitialSessionState("s-1", "p-1", "ws-1");
    state = sessionReducer(
      state,
      {
        type: "ToolCallContentChunk",
        body: {
          tool_call_id: "run",
          item: { Terminal: { terminal_id: "t-1" } },
        },
      },
      1,
    );
    const tool = entry("run", state.liveEntries);
    expect(isToolCall(tool) && tool.terminalIds).toEqual(["t-1"]);
    expect(isToolCall(tool) && tool.output).toBeNull();
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

describe("thought timing", () => {
  const thoughtChunk = (text: string) => ({
    type: "MessageChunk" as const,
    body: {
      message_id: "thought-1",
      role: "Thought" as const,
      block: { Text: text },
    },
  });

  it("dates a thought from Core's event time and ends it when the agent moves on", () => {
    let state = createInitialSessionState("s-1", "p-1", "ws-1");
    state = sessionReducer(state, thoughtChunk("weighing"), 1, 1_000);
    state = sessionReducer(
      state,
      {
        type: "MessageChunk",
        body: {
          message_id: "reply-1",
          role: "Agent",
          block: { Text: "Done." },
        },
      },
      2,
      15_000,
    );
    const thought = entry("thought-1", state.liveEntries) as
      | TurnMessageEntry
      | undefined;
    expect(thought?.timestamp).toBe(1_000);
    expect(thought?.streaming).toBe(false);
    expect(thought?.endedAt).toBe(15_000);
  });

  it("keeps the surface an adapter named across later updates", () => {
    let state = createInitialSessionState("s-1", "p-1", "ws-1");
    const upsert = (patch: Record<string, unknown>, seq: number) => {
      state = sessionReducer(
        state,
        {
          type: "ToolCallUpsert",
          body: {
            tool_call_id: "todo-1",
            patch: {
              title: null,
              kind: null,
              status: null,
              input: null,
              output: null,
              ...patch,
            },
          },
        },
        seq,
      );
    };
    upsert({ title: "todowrite", kind: "think", surface: "todo" }, 1);
    upsert({ title: "3 todos", status: "Completed" }, 2);
    const tool = entry("todo-1", state.liveEntries);
    expect(isToolCall(tool) ? tool.surface : null).toBe("todo");
  });
});
