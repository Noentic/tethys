import { fireEvent } from "@testing-library/dom";
import { render, screen, waitFor } from "@testing-library/react";
import type { ContentBlock, QueuedPrompt } from "@tethys/bindings";
import { clearRegistriesForTesting, getAllActionBarSlots } from "@tethys/ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptQueue } from "./queue";
import { QUEUE_COUNT_PRIORITY, QueueCountSlot } from "./queue-count-slot";
import { registerComposerSlots } from "./register";

function text(value: string): ContentBlock[] {
  return [{ Text: value } as ContentBlock];
}

function item(id: string, value: string, ordinal: number): QueuedPrompt {
  return { id, thread_id: "t1", blocks: text(value), ordinal };
}

function clientWith(items: QueuedPrompt[]) {
  return {
    thread: {
      queueList: vi.fn().mockResolvedValue(items),
      queueAdd: vi.fn(),
      queueRemove: vi.fn().mockResolvedValue(undefined),
      queueReorder: vi.fn().mockResolvedValue(undefined),
    },
  };
}

afterEach(() => clearRegistriesForTesting());

describe("PromptQueue", () => {
  it("lists queued prompts and reorders by index", async () => {
    const client = clientWith([
      item("q-1", "first", 0),
      item("q-2", "second", 1),
    ]);
    render(<PromptQueue client={client} threadId="t1" />);
    expect(await screen.findByText("first")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Move queued prompt 1 down" }),
    );
    await waitFor(() =>
      expect(client.thread.queueReorder).toHaveBeenCalledWith("t1", [
        "q-2",
        "q-1",
      ]),
    );
  });

  it("edits and removes queued prompts", async () => {
    const client = clientWith([item("q-1", "first", 0)]);
    const onEdit = vi.fn();
    render(<PromptQueue client={client} threadId="t1" onEdit={onEdit} />);
    expect(await screen.findByText("first")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Edit queued prompt 1" }),
    );
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "q-1" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Remove queued prompt 1" }),
    );
    await waitFor(() =>
      expect(client.thread.queueRemove).toHaveBeenCalledWith("t1", "q-1"),
    );
  });
});

describe("queue-count slot", () => {
  it("is hidden at zero and renders the count otherwise", () => {
    const { rerender } = render(<QueueCountSlot data={{ count: 0 }} />);
    expect(screen.queryByTestId("queue-count")).toBeNull();
    rerender(<QueueCountSlot data={{ count: 3 }} />);
    expect(screen.getByTestId("queue-count").textContent).toBe("3 queued");
  });

  it("registers at the DESIGN action-bar priority", () => {
    registerComposerSlots();
    const slot = getAllActionBarSlots().find(([id]) => id === "queue-count");
    expect(slot?.[1].priority).toBe(QUEUE_COUNT_PRIORITY);
  });
});
