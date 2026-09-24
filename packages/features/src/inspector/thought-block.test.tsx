import { fireEvent, render, screen } from "@testing-library/react";
import type { TurnMessageEntry } from "@tethys/state";
import { describe, expect, it } from "vitest";
import { ThoughtBlockRenderer } from "./renderers/thought-block";

function thought(patch: Partial<TurnMessageEntry>): TurnMessageEntry {
  return {
    id: "th-1",
    kind: "turn_message",
    role: "Thought",
    content: "Weighing the options",
    timestamp: 1_000,
    ...patch,
  };
}

describe("thought block", () => {
  it("shimmers and stays open while the agent is thinking", () => {
    render(<ThoughtBlockRenderer entry={thought({ streaming: true })} />);
    expect(screen.getByText("Thinking…").className).toContain("text-shimmer");
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("folds to its duration once the agent moves on", () => {
    render(
      <ThoughtBlockRenderer
        entry={thought({ streaming: false, endedAt: 15_000 })}
      />,
    );
    const toggle = screen.getByRole("button");
    expect(toggle.textContent).toContain("Thought for 14s");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the user's choice when streaming ends", () => {
    const { rerender } = render(
      <ThoughtBlockRenderer entry={thought({ streaming: true })} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe(
      "false",
    );
    rerender(
      <ThoughtBlockRenderer
        entry={thought({ streaming: false, endedAt: 4_000 })}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe(
      "true",
    );
  });
});
