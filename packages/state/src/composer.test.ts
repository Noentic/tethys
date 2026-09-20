import type { ContentBlock, QueuedPrompt } from "@tethys/bindings";
import { describe, expect, it, vi } from "vitest";
import {
  createPromptQueueStore,
  enqueuePrompt,
  loadQueue,
  type PromptQueueClient,
  removeQueued,
  reorderQueued,
  selectAgentCommands,
  selectConfigOptions,
} from "./composer";
import { createInitialSessionState } from "./reducers";

function text(value: string): ContentBlock[] {
  return [{ Text: value } as ContentBlock];
}

function queued(id: string, value: string, ordinal = 0): QueuedPrompt {
  return {
    id,
    thread_id: "t1",
    blocks: text(value),
    ordinal,
  };
}

function mockClient(items: QueuedPrompt[]): PromptQueueClient {
  return {
    thread: {
      queueList: vi.fn().mockResolvedValue(items),
      queueAdd: vi.fn().mockResolvedValue(queued("q-3", "new", 2)),
      queueRemove: vi.fn().mockResolvedValue(undefined),
      queueReorder: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("composer selectors", () => {
  it("reads agent commands and config options off session state", () => {
    const state = createInitialSessionState("t1", "p1", "w1");
    expect(selectAgentCommands(state)).toEqual([]);
    expect(selectConfigOptions(state)).toEqual([]);
  });
});

describe("prompt queue store", () => {
  it("loads, appends, removes and reorders through the client", async () => {
    const client = mockClient([
      queued("q-1", "first"),
      queued("q-2", "second", 1),
    ]);
    const store = createPromptQueueStore();

    await loadQueue(store, client, "t1");
    expect(store.state.items.map((item) => item.id)).toEqual(["q-1", "q-2"]);

    await enqueuePrompt(store, client, "t1", text("new"));
    expect(store.state.items.map((item) => item.id)).toEqual([
      "q-1",
      "q-2",
      "q-3",
    ]);

    await reorderQueued(store, client, "t1", ["q-3", "q-1", "q-2"]);
    expect(store.state.items.map((item) => item.id)).toEqual([
      "q-3",
      "q-1",
      "q-2",
    ]);
    expect(store.state.items[0].ordinal).toBe(0);

    await removeQueued(store, client, "t1", "q-1");
    expect(store.state.items.map((item) => item.id)).toEqual(["q-3", "q-2"]);
    expect(client.thread.queueRemove).toHaveBeenCalledWith("t1", "q-1");
  });

  it("records a load error without clearing existing items", async () => {
    const store = createPromptQueueStore();
    const client = mockClient([]);
    client.thread.queueList = vi.fn().mockRejectedValue(new Error("no store"));
    await loadQueue(store, client, "t1");
    expect(store.state.error).toBe("no store");
  });
});
