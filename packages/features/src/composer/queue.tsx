//! Composer prompt queue (`CMP-05`; M1.10 U5) — editable, reorderable,
//! persisted through `thread.queue.*`.

import type { ContentBlock, QueuedPrompt } from "@tethys/bindings";
import {
  createPromptQueueStore,
  loadQueue,
  type PromptQueueClient,
  type PromptQueueStore,
  removeQueued,
  reorderQueued,
} from "@tethys/state";
import { useEffect, useState } from "react";

/** Minimal store binding so `@tethys/state` stays React-version-agnostic. */
function useStoreState<T>(store: {
  state: T;
  subscribe: (listener: () => void) => { unsubscribe: () => void };
}): T {
  const [state, setState] = useState(store.state);
  useEffect(() => {
    const subscription = store.subscribe(() => setState(store.state));
    return () => subscription.unsubscribe();
  }, [store]);
  return state;
}

export function queuePreview(blocks: ContentBlock[]): string {
  const text = blocks
    .map((block) => ("Text" in block ? block.Text : "[attachment]"))
    .join(" ");
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

export interface PromptQueueProps {
  client: PromptQueueClient;
  threadId: string;
  /**
   * The store to render. A host that also enqueues into it (the docked prompt
   * card) passes its own so the list and the count share one source; without
   * one the list owns a store.
   */
  store?: PromptQueueStore;
  /** Reopens a queued prompt in the composer for editing. */
  onEdit?: (item: QueuedPrompt) => void;
  className?: string;
}

/**
 * The staged-prompt list under the composer. Reordering persists via
 * `thread.queue.reorder`; items are edited by reopening them in the editor.
 */
export function PromptQueue({
  client,
  threadId,
  store: sharedStore,
  onEdit,
  className,
}: PromptQueueProps) {
  const [ownStore] = useState(() => createPromptQueueStore());
  const store = sharedStore ?? ownStore;
  const state = useStoreState(store);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    void loadQueue(store, client, threadId);
  }, [store, client, threadId]);

  if (state.items.length === 0) return null;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= state.items.length || from === to) return;
    const ids = state.items.map((item) => item.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    void reorderQueued(store, client, threadId, ids);
  };

  return (
    <ol
      aria-label="Prompt queue"
      className={className ?? "flex flex-col gap-1"}
    >
      {state.items.map((item, index) => (
        <li
          key={item.id}
          draggable
          onDragStart={() => setDragIndex(index)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (dragIndex !== null) move(dragIndex, index);
            setDragIndex(null);
          }}
          className="flex items-center gap-2 rounded-sm bg-(--tethys-surface-hover) px-2 py-1 text-body-sm text-(--tethys-text-secondary)"
        >
          <span className="font-mono text-mono-micro text-(--tethys-text-muted)">
            {index + 1}
          </span>
          <span className="flex-1 truncate">{queuePreview(item.blocks)}</span>
          {onEdit && (
            <button
              type="button"
              aria-label={`Edit queued prompt ${index + 1}`}
              onClick={() => onEdit(item)}
              className="focus-ring rounded-xs px-1 text-label-sm hover:text-(--tethys-text-primary)"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            aria-label={`Move queued prompt ${index + 1} up`}
            disabled={index === 0}
            onClick={() => move(index, index - 1)}
            className="focus-ring rounded-xs px-1 disabled:opacity-40"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move queued prompt ${index + 1} down`}
            disabled={index === state.items.length - 1}
            onClick={() => move(index, index + 1)}
            className="focus-ring rounded-xs px-1 disabled:opacity-40"
          >
            ↓
          </button>
          <button
            type="button"
            aria-label={`Remove queued prompt ${index + 1}`}
            onClick={() => void removeQueued(store, client, threadId, item.id)}
            className="focus-ring rounded-xs px-1 hover:text-(--tethys-status-danger)"
          >
            ×
          </button>
        </li>
      ))}
    </ol>
  );
}
