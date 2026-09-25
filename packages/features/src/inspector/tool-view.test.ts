import type { ToolCallEntry } from "@tethys/state";
import { describe, expect, it } from "vitest";
import {
  surfaceOf,
  toolCommand,
  toolDiffs,
  toolHeadline,
  toolOutputText,
  toolTodos,
} from "./tool-view";

function call(patch: Partial<ToolCallEntry>): ToolCallEntry {
  return {
    id: "t",
    kind: "tool_call",
    toolCallId: "t",
    title: "tool",
    status: "Completed",
    locations: [],
    timestamp: 0,
    ...patch,
  };
}

describe("tool view", () => {
  it("prefers the Provider's ACP diff content", () => {
    const [diff] = toolDiffs(
      call({
        toolKind: "edit",
        diffs: [{ path: "a.ts", patch: "@@ -1 +1 @@\n-a\n+b\n" }],
      }),
    );
    expect(diff?.path).toBe("a.ts");
    expect(diff?.additions).toBe(1);
  });

  it("reads the patch OpenCode reports in its output metadata", () => {
    const patch =
      "--- a/README.md\n+++ b/README.md\n@@ -1,1 +1,2 @@\n # T\n+new\n";
    const [diff] = toolDiffs(
      call({
        toolKind: "edit",
        input: JSON.stringify({ filePath: "/r/README.md" }),
        output: JSON.stringify({ output: "ok", metadata: { diff: patch } }),
      }),
    );
    expect(diff?.path).toBe("/r/README.md");
    expect(diff?.additions).toBe(1);
  });

  it("shows a new file's whole content as added", () => {
    const [diff] = toolDiffs(
      call({
        toolKind: "edit",
        input: JSON.stringify({ file_path: "n.ts", content: "a\nb\n" }),
      }),
    );
    expect(diff?.additions).toBe(2);
    expect(diff?.deletions).toBe(0);
  });

  it("unwraps a shell wrapper to the command that matters", () => {
    expect(
      toolCommand(
        call({ input: JSON.stringify({ command: ["bash", "-lc", "ls -la"] }) }),
      ),
    ).toBe("ls -la");
  });

  it("reads the text inside a JSON output envelope", () => {
    expect(
      toolOutputText(call({ output: JSON.stringify({ output: "done" }) })),
    ).toBe("done");
    expect(toolOutputText(call({ output: "plain" }))).toBe("plain");
  });

  it("names the act in the tense of the call and falls back to the title", () => {
    const running = call({
      status: "Executing",
      toolKind: "read",
      input: JSON.stringify({ path: "/r/src/app.ts" }),
    });
    expect(toolHeadline(running)).toEqual({
      verb: "Reading",
      subject: "app.ts",
      mono: true,
    });
    expect(toolHeadline(call({ toolKind: "other", title: "Custom" }))).toEqual({
      verb: null,
      subject: "Custom",
      mono: false,
    });
  });

  it("reads the file text out of a raw envelope and the content streamed after it", () => {
    const envelope = JSON.stringify({
      output:
        "<path>/repo/README.md</path>\n<type>file</type>\n<content>\n1: # nebeng\n</content>",
    });
    expect(toolOutputText(call({ output: envelope }))).toBe("1: # nebeng");
    // The raw output followed by the same text streamed as content.
    expect(
      toolOutputText(
        call({ output: `${envelope}<path>a</path>\n<content>\n1: # x` }),
      ),
    ).toBe("1: # x");
    // A bare JSON string is the text itself, not the quoted string.
    expect(toolOutputText(call({ output: JSON.stringify("1\tline") }))).toBe(
      "1\tline",
    );
  });

  it("derives a surface from kind and origin, and keeps an adapter's surface", () => {
    expect(surfaceOf(call({ toolKind: "execute" }))).toBe("shell");
    expect(surfaceOf(call({ toolKind: "move" }))).toBe("edit");
    expect(
      surfaceOf(
        call({ toolKind: "other", origin: { kind: "mcp", server: "github" } }),
      ),
    ).toBe("mcp");
    expect(surfaceOf(call({ toolKind: "fetch", surface: "web_search" }))).toBe(
      "web_search",
    );
    expect(surfaceOf(call({}))).toBe("other");
  });

  it("names MCP, web search, and question calls by what they did", () => {
    expect(
      toolHeadline(
        call({
          title: "mcp__github__create_issue",
          origin: { kind: "mcp", server: "github" },
        }),
      ),
    ).toEqual({ verb: null, subject: "github · create_issue", mono: true });
    expect(
      toolHeadline(
        call({
          surface: "web_search",
          input: JSON.stringify({ query: "acp spec" }),
        }),
      ),
    ).toEqual({
      verb: "Searched the web for",
      subject: "“acp spec”",
      mono: false,
    });
    expect(
      toolHeadline(
        call({
          surface: "question",
          input: JSON.stringify({ questions: [{ question: "Which db?" }] }),
        }),
      ).subject,
    ).toBe("Which db?");
  });

  it("reads a todo write's list from its input", () => {
    expect(
      toolTodos(
        call({
          input: JSON.stringify({
            todos: [
              { content: "Write", status: "completed" },
              { content: "Ship", status: "in_progress" },
              { content: "?", status: "cancelled" },
            ],
          }),
        }),
      ).map((step) => [step.content, step.status]),
    ).toEqual([
      ["Write", "Completed"],
      ["Ship", "InProgress"],
    ]);
  });
});
