//! First-turn dispatch for a prepared draft (M1.17 AD5; spec §3 UX flow).
//!
//! The draft was prepared by `usePreparedDraft` (connect + `session/new`)
//! before the composer claimed readiness. Submit applies changed options,
//! seeds the session store from the bootstrap snapshot, navigates, and starts
//! the first turn without awaiting it: ACP v1 `session/prompt` resolves at
//! turn end, so the live route must mount while the turn is still running.

import type { ContentBlock, ThreadBootstrap } from "@tethys/bindings";
import { getSessionStreamManager, hydrateSessionView } from "@tethys/state";

/** The narrow `thread.*` slice first-turn dispatch needs. */
export interface StartSessionClient {
  thread: {
    setConfigOption(id: string, optionId: string, value: string): Promise<void>;
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
 * Applies config, seeds the shared session store from the prepared bootstrap,
 * navigates, then dispatches the first prompt. Returns the promoted thread id.
 */
export async function startSession(
  client: StartSessionClient,
  input: StartSessionInput,
  navigate: Navigate,
): Promise<string> {
  const id = input.draft.thread.id;

  for (const [optionId, value] of Object.entries(input.changedConfig ?? {})) {
    await client.thread.setConfigOption(id, optionId, value);
  }

  const store = hydrateSessionView(input.draft);
  getSessionStreamManager(id, store, input.draft.latest_seq);
  navigate(`/thread/${id}`);
  await client.thread.prompt(
    id,
    input.blocks?.length
      ? input.blocks
      : [{ Text: input.promptText } as ContentBlock],
  );

  return id;
}
