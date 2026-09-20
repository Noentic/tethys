//! Composer state: Provider-advertised commands, session config options, and
//! the persisted prompt queue (`CMP-01..05`; M1.10).

import { Store } from "@tanstack/store";
import type {
  AgentCommand,
  ConfigOption,
  ContentBlock,
  QueuedPrompt,
} from "@tethys/bindings";

import type { SessionState } from "./reducers";

/** The Provider's advertised `/agent:name` commands (`CommandsAvailable`). */
export function selectAgentCommands(state: SessionState): AgentCommand[] {
  return state.agentCommands;
}

/** The live session's config options (`ConfigOptionsChanged`). */
export function selectConfigOptions(state: SessionState): ConfigOption[] {
  return state.configOptions;
}

/**
 * The `thread.queue.*` slice of the client the queue store needs. Narrowed so
 * the store is testable with a plain object and does not depend on the whole
 * `TethysClient`.
 */
export interface PromptQueueClient {
  thread: {
    queueList(id: string): Promise<QueuedPrompt[]>;
    queueAdd(id: string, blocks: ContentBlock[]): Promise<QueuedPrompt>;
    queueRemove(id: string, queuedId: string): Promise<void>;
    queueReorder(id: string, orderedIds: string[]): Promise<void>;
  };
}

export interface PromptQueueState {
  items: QueuedPrompt[];
  loading: boolean;
  error: string | null;
}

export function createPromptQueueStore(
  initial: PromptQueueState = { items: [], loading: false, error: null },
): Store<PromptQueueState> {
  return new Store<PromptQueueState>(initial);
}

export type PromptQueueStore = ReturnType<typeof createPromptQueueStore>;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Loads the durable queue from the backend into the store. */
export async function loadQueue(
  store: PromptQueueStore,
  client: PromptQueueClient,
  threadId: string,
): Promise<void> {
  store.setState((prev) => ({ ...prev, loading: true, error: null }));
  try {
    const items = await client.thread.queueList(threadId);
    store.setState(() => ({ items, loading: false, error: null }));
  } catch (error) {
    store.setState((prev) => ({
      ...prev,
      loading: false,
      error: messageOf(error),
    }));
  }
}

/** Appends a staged prompt without interrupting the stream. */
export async function enqueuePrompt(
  store: PromptQueueStore,
  client: PromptQueueClient,
  threadId: string,
  blocks: ContentBlock[],
): Promise<void> {
  const item = await client.thread.queueAdd(threadId, blocks);
  store.setState((prev) => ({ ...prev, items: [...prev.items, item] }));
}

export async function removeQueued(
  store: PromptQueueStore,
  client: PromptQueueClient,
  threadId: string,
  queuedId: string,
): Promise<void> {
  await client.thread.queueRemove(threadId, queuedId);
  store.setState((prev) => ({
    ...prev,
    items: prev.items.filter((item) => item.id !== queuedId),
  }));
}

/** Persists a new order; `orderedIds` is the full remaining queue order. */
export async function reorderQueued(
  store: PromptQueueStore,
  client: PromptQueueClient,
  threadId: string,
  orderedIds: string[],
): Promise<void> {
  await client.thread.queueReorder(threadId, orderedIds);
  const byId = new Map(store.state.items.map((item) => [item.id, item]));
  const items = orderedIds
    .map((id) => byId.get(id))
    .filter((item): item is QueuedPrompt => item !== undefined)
    .map((item, ordinal) => ({ ...item, ordinal }));
  store.setState((prev) => ({ ...prev, items }));
}
