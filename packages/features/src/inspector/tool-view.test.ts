import type { ToolCallEntry } from "@tethys/state";
import { describe, expect, it } from "vitest";
import {
  toolCommand,
  toolDiffs,
  toolHeadline,
  toolOutputText,
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
});
