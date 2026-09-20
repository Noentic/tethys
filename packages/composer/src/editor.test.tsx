import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { ComposerEditor } from "./editor";
import type { EditorHandle } from "./types";

function setup() {
  const ref = createRef<EditorHandle>();
  render(<ComposerEditor ref={ref} />);
  return ref;
}

function insert(
  ref: React.RefObject<EditorHandle | null>,
  chip: Parameters<EditorHandle["insertChip"]>[0],
) {
  act(() => ref.current?.insertChip(chip));
}

describe("ComposerEditor chips", () => {
  it("serializes an expanded command chip to its resolved text", () => {
    const ref = setup();
    insert(ref, {
      kind: "command",
      name: "review",
      token: "Please review the diff.",
    });
    expect(ref.current?.serializeToPrompt()).toBe("Please review the diff.");
  });

  it("serializes a skill chip to its reference token, never the body", async () => {
    const ref = setup();
    insert(ref, {
      kind: "skill",
      name: "commit",
      token: "$commit",
      injectionMethod: "referenced",
    });
    expect(ref.current?.serializeToPrompt()).toBe("$commit");
    const badge = await screen.findByTestId("injection-method-badge");
    expect(badge.textContent).toBe("Referenced");
  });

  it("serializes a path chip to @<relative-path>, never contents", () => {
    const ref = setup();
    insert(ref, {
      kind: "path",
      name: "src/main.rs",
      token: "@src/main.rs",
      path: "src/main.rs",
    });
    expect(ref.current?.serializeToPrompt()).toBe("@src/main.rs");
  });

  it("passes an agent command through unchanged", () => {
    const ref = setup();
    insert(ref, {
      kind: "agent-command",
      name: "deploy",
      token: "/agent:deploy",
    });
    expect(ref.current?.serializeToPrompt()).toBe("/agent:deploy");
  });

  it("reports emptiness and clears", () => {
    const ref = setup();
    expect(ref.current?.isEmpty()).toBe(true);
    insert(ref, { kind: "command", name: "x", token: "hello" });
    expect(ref.current?.isEmpty()).toBe(false);
    act(() => ref.current?.clear());
    expect(ref.current?.isEmpty()).toBe(true);
  });

  it("submits on Ctrl/Cmd+Enter but not on bare Enter", () => {
    const onSubmit = vi.fn();
    const ref = createRef<EditorHandle>();
    render(<ComposerEditor ref={ref} onSubmit={onSubmit} />);
    const surface = document.querySelector(".ProseMirror");
    if (!surface) throw new Error("editor surface not mounted");
    fireEvent.keyDown(surface, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(surface, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(surface, { key: "Enter", metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});
