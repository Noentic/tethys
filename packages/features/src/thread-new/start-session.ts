//! First-turn dispatch for a prepared draft (M1.17 AD5; spec §3 UX flow).
//!
//! The draft was prepared by `usePreparedDraft` (connect + `session/new`)
//! before the composer claimed readiness. Submit applies changed options,
//! refreshes dependent options when the model changes, hydrates the session
//! store, navigates, and starts the first turn without awaiting it: ACP v1
//! `session/prompt` resolves at turn end, so the live route must mount while
//! the turn is still running.

import type {
  ContentBlock,
  ThreadBootstrap,
  ThreadSessionView,
} from "@tethys/bindings";
import { getSessionStreamManager, hydrateSessionView } from "@tethys/state";

/** The narrow `thread.*` slice first-turn dispatch needs. */
export interface StartSessionClient {
  thread: {
    setConfigOption(id: string, optionId: string, value: string): Promise<void>;
    /** Refreshes dependent config options after a model change. */
    get?(id: string): Promise<ThreadSessionView>;
    prompt(id: string, blocks: ContentBlock[]): Promise<void>;
  };
}

export interface StartSessionInput {
  draft: ThreadBootstrap;
  /** Serialized composer prompt; the session's first turn. */
  promptText: string;
  /** optionId → value for options changed from the bootstrap values. */
  changedConfig?: Record<string, string>;
  /** Typed ACP blocks built from the composer and attachments. */
  blocks?: ContentBlock[];
}

export type Navigate = (to: string) => void;

/**
 * Applies config, refreshes dependent schema when available, seeds the shared
 * session store, navigates, then dispatches the first prompt. Returns the
 * promoted thread id.
 */
export async function startSession(
  client: StartSessionClient,
  input: StartSessionInput,
  navigate: Navigate,
): Promise<string> {
  const id = input.draft.thread.id;
  let availableOptions = input.draft.config_options;
  let snapshot: ThreadBootstrap | ThreadSessionView = input.draft;
  let changed = false;

  for (const [optionId, value] of Object.entries(input.changedConfig ?? {})) {
    // A model switch can remove dependent options such as Claude's effort
    // control. Do not send a stale option that the refreshed schema no longer
    // advertises.
    if (!availableOptions.some((option) => option.id === optionId)) continue;
    await client.thread.setConfigOption(id, optionId, value);
    changed = true;
    availableOptions = availableOptions.map((option) =>
      option.id === optionId ? { ...option, current_value: value } : option,
    );

    if (
      client.thread.get &&
      availableOptions.find((option) => option.id === optionId)?.category ===
        "model"
    ) {
      snapshot = await client.thread.get(id);
      availableOptions = snapshot.config_options;
    }
  }

  if (changed && client.thread.get) {
    snapshot = await client.thread.get(id);
  } else if (changed) {
    snapshot = { ...input.draft, config_options: availableOptions };
  }

  const store = hydrateSessionView(snapshot);
  getSessionStreamManager(id, store, snapshot.latest_seq);
  navigate(`/thread/${id}`);
  await client.thread.prompt(
    id,
    input.blocks?.length
      ? input.blocks
      : [{ Text: input.promptText } as ContentBlock],
  );

  return id;
}
