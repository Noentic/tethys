//! `session/new` composition on submit (M1.10 U9; spec §3 UX flow).
//!
//! Sequence: `thread.create` (explicit `cwd`) → `thread.setConfigOption` for
//! each changed option → `thread.prompt` with the serialized prompt as the
//! first turn → navigate to the real `ThreadSummary.id`. The workspace's
//! `mcpServers` are composed server-side (`thread_session.rs create()`), so
//! the webview never assembles them.

import type { ContentBlock } from "@tethys/bindings";
import type { ProviderConnection, TrustedWorkspace } from "@tethys/state";

/** The narrow `thread.*` slice start-session needs. */
export interface StartSessionClient {
  thread: {
    create(request: {
      workspace_id: string;
      agent_profile_id: string;
      workdir: string;
    }): Promise<{ id: string }>;
    setConfigOption(id: string, optionId: string, value: string): Promise<void>;
    prompt(id: string, blocks: ContentBlock[]): Promise<void>;
  };
}

export interface StartSessionInput {
  workspace: TrustedWorkspace | null;
  provider: ProviderConnection;
  /** Serialized composer prompt; the session's first turn. */
  promptText: string;
  /** optionId → value for options changed from the Provider's default. */
  changedConfig?: Record<string, string>;
}

export type Navigate = (to: string) => void;

/**
 * Creates the thread and delivers the typed prompt as its first turn.
 * Returns the new thread id, or `null` when the workspace is unresolved
 * (guard for the disabled-submit path).
 */
export async function startSession(
  client: StartSessionClient,
  input: StartSessionInput,
  navigate: Navigate,
): Promise<string | null> {
  if (!input.workspace) return null;

  const summary = await client.thread.create({
    workspace_id: input.workspace.id,
    agent_profile_id: input.provider.profileId,
    workdir: input.workspace.path,
  });

  for (const [optionId, value] of Object.entries(input.changedConfig ?? {})) {
    await client.thread.setConfigOption(summary.id, optionId, value);
  }

  await client.thread.prompt(summary.id, [
    { Text: input.promptText } as ContentBlock,
  ]);

  navigate(`/thread/${summary.id}`);
  return summary.id;
}
