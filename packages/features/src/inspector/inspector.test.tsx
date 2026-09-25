import { render, screen, waitFor } from "@testing-library/react";
import type {
  CheckpointEntry,
  FileWriteEntry,
  PlanStep,
  ToolCallEntry,
  TurnMessageEntry,
} from "@tethys/state";
import { clearRegistriesForTesting, getEntryRenderer } from "@tethys/ui";
import { beforeEach, describe, expect, it } from "vitest";
import { registerInspectorRenderers } from "./register";
import { PlanPanel } from "./renderers/plan-panel";
import { TimelineEventRenderer } from "./renderers/timeline-event";
import { ToolAccordionRenderer } from "./renderers/tool-accordion";
import { TurnMessageRenderer } from "./renderers/turn-message";

function message(partial: Partial<TurnMessageEntry>): TurnMessageEntry {
  return {
    id: "m1",
    kind: "turn_message",
    role: "Agent",
    content: "",
    timestamp: 0,
    ...partial,
  };
}

function toolCall(partial: Partial<ToolCallEntry>): ToolCallEntry {
  return {
    id: "t1",
    kind: "tool_call",
    toolCallId: "t1",
    title: "Read file",
    status: "Pending",
    locations: [],
    timestamp: 0,
    ...partial,
  };
}

describe("Transcript entry renderers (M1.7 U8)", () => {
  beforeEach(() => {
    clearRegistriesForTesting();
    registerInspectorRenderers();
  });

  it("renders markdown HTML, not escaped markdown", async () => {
    render(<TurnMessageRenderer entry={message({ content: "# Heading" })} />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
        "Heading",
      ),
    );
  });

  it("registers the transcript renderers through the registry seam", () => {
    // Import side effect (register.ts) is loaded by the barrel.
    expect(getEntryRenderer("turn_message")).not.toBe(
      getEntryRenderer("definitely-unregistered-kind"),
    );
    expect(getEntryRenderer("file_write")).not.toBe(
      getEntryRenderer("definitely-unregistered-kind"),
    );
    expect(getEntryRenderer("checkpoint")).not.toBe(
      getEntryRenderer("definitely-unregistered-kind"),
    );
  });

  it("patches one tool card in place rather than appending", () => {
    const { rerender, container } = render(
      <ToolAccordionRenderer entry={toolCall({ status: "Executing" })} />,
    );
    rerender(
      <ToolAccordionRenderer
        entry={toolCall({ status: "Completed", title: "Read file done" })}
      />,
    );
    expect(
      container.querySelectorAll('[data-entry-kind="tool_call"]'),
    ).toHaveLength(1);
    expect(screen.getByText("Read file done")).toBeTruthy();
  });

  it("renders an edit payload as a visible file diff", () => {
    render(
      <ToolAccordionRenderer
        entry={toolCall({
          status: "Pending",
          title: "Edit README.md",
          toolKind: "edit",
          input: JSON.stringify({
            file_path: "README.md",
            old_string: "old line",
            new_string: "new line",
          }),
        })}
      />,
    );
    const diff = screen.getByTestId("file-diff-card");
    expect(
      diff.querySelector('[data-row-kind="deletion"]')?.textContent,
    ).toContain("old line");
    expect(
      diff.querySelector('[data-row-kind="addition"]')?.textContent,
    ).toContain("new line");
  });

  it("reads OpenCode's camelCase edit fields and names the file in the header", () => {
    render(
      <ToolAccordionRenderer
        entry={toolCall({
          status: "Completed",
          title: "README.md",
          toolKind: "edit",
          input: JSON.stringify({
            filePath: "/repo/README.md",
            oldString: "## Quick Start",
            newString: "## Demo\n\n## Quick Start",
          }),
          output: JSON.stringify({ output: "Edit applied successfully." }),
        })}
      />,
    );
    expect(screen.getByText("Edited")).toBeTruthy();
    expect(screen.getByTitle("README.md")).toBeTruthy();
    expect(screen.getByTestId("file-diff-card")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /2 lines added, 0 lines removed/ }),
    ).toBeTruthy();
  });

  it("shows a shell call as its command and the tail of its output", () => {
    render(
      <ToolAccordionRenderer
        entry={toolCall({
          status: "Failed",
          title: "bash",
          toolKind: "execute",
          input: JSON.stringify({ command: "pnpm test" }),
          output: JSON.stringify({
            output: "1 failed",
            metadata: { exit: 1 },
          }),
        })}
      />,
    );
    expect(screen.getByText("Ran")).toBeTruthy();
    expect(screen.getAllByText("pnpm test").length).toBeGreaterThan(0);
    expect(screen.getByText("exit 1")).toBeTruthy();
    expect(screen.getByLabelText("Command output").textContent).toContain(
      "1 failed",
    );
  });

  it("shows an MCP call's arguments as named values and its result", () => {
    render(
      <ToolAccordionRenderer
        entry={toolCall({
          status: "Failed",
          title: "create_issue",
          toolKind: "other",
          origin: { kind: "mcp", server: "github" },
          input: JSON.stringify({ title: "Bug" }),
          output: JSON.stringify({ number: 7 }),
        })}
      />,
    );
    expect(screen.getByText("github · create_issue")).toBeTruthy();
    expect(screen.getByText("title")).toBeTruthy();
    expect(screen.getByText("Bug")).toBeTruthy();
    expect(screen.getByLabelText("Tool result").textContent).toContain(
      '"number":7',
    );
  });

  it("renders filesystem and checkpoint ACP entries", () => {
    const fileWrite: FileWriteEntry = {
      id: "write-1",
      kind: "file_write",
      path: "src/main.ts",
      before: null,
      after: "export {}",
      via: "AcpFs",
      timestamp: 0,
    };
    const checkpoint: CheckpointEntry = {
      id: "checkpoint-1",
      kind: "checkpoint",
      oid: "abc123",
      checkpointKind: "TurnEnd",
      timestamp: 0,
    };
    render(
      <>
        <TimelineEventRenderer entry={fileWrite} />
        <TimelineEventRenderer entry={checkpoint} />
      </>,
    );
    expect(screen.getByText("Created")).toBeTruthy();
    expect(screen.getByTitle("src/main.ts")).toBeTruthy();
    expect(screen.getByText(/turn end/)).toBeTruthy();
  });

  it("marks the in-progress plan step with aria-current", () => {
    const steps: PlanStep[] = [
      { content: "one", priority: "Medium", status: "Completed" },
      { content: "two", priority: "Medium", status: "Completed" },
      { content: "three", priority: "Medium", status: "Completed" },
      { content: "four", priority: "Medium", status: "InProgress" },
      { content: "five", priority: "Medium", status: "Pending" },
    ];
    render(<PlanPanel data={steps} />);
    expect(screen.getByText("Plan · 3/5 complete")).toBeTruthy();
    const current = document.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain("four");
  });
});
