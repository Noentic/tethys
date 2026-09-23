//! Prepared session draft (M1.17 AD5): connects and calls `session/new` as
//! soon as a trusted workspace and a ready Provider are selected, so the
//! new-thread config panel renders the Provider's real options before the
//! first prompt. Replacing either selection discards the unprompted draft.

import type {
  ThreadBootstrap,
  ThreadIsolation,
  PermissionMode,
  WorkspaceCapabilities,
} from "@tethys/bindings";
import {
  isProviderSelectable,
  type ProviderConnection,
  type TrustedWorkspace,
} from "@tethys/state";
import { useEffect, useRef, useState } from "react";

const CURRENT_ISOLATION: ThreadIsolation = { kind: "current" };

/** The narrow `thread.*` slice preparing and discarding a draft needs. */
export interface DraftSessionClient {
  workspace?: {
    initializeGit(workspaceId: string): Promise<WorkspaceCapabilities>;
  };
  thread: {
    prepare(request: {
      workspace_id: string;
      agent_profile_id: string;
      workdir: string;
      additional_directories?: string[];
      isolation?: ThreadIsolation;
    }): Promise<ThreadBootstrap>;
    delete(id: string): Promise<void>;
    setPermissionMode?(id: string, mode: PermissionMode): Promise<void>;
  };
}

export type PreparedDraftStatus =
  | "idle"
  | "preparing"
  | "ready"
  | "auth-required"
  | "error";

export interface PreparedDraft {
  status: PreparedDraftStatus;
  bootstrap: ThreadBootstrap | null;
  error: string | null;
  /** Clears local state after the draft is promoted by its first prompt. */
  release(): void;
  /** Prepares a replacement after a failed submit left the draft untracked. */
  retry(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAuthRequired(error: unknown): boolean {
  return errorMessage(error).includes("AUTH_REQUIRED");
}

export function usePreparedDraft(
  client: DraftSessionClient,
  workspace: TrustedWorkspace | null,
  provider: ProviderConnection | null,
  additionalDirectories: TrustedWorkspace[] = [],
  isolation: ThreadIsolation = CURRENT_ISOLATION,
): PreparedDraft {
  const [state, setState] = useState<Omit<PreparedDraft, "release" | "retry">>({
    status: "idle",
    bootstrap: null,
    error: null,
  });
  const heldDraft = useRef<string | null>(null);
  const generation = useRef(0);
  const [retryTick, setRetryTick] = useState(0);

  const workspaceId = workspace?.id ?? null;
  const workspacePath = workspace?.path ?? null;
  const providerId = provider?.profileId ?? null;
  const selectable = provider !== null && isProviderSelectable(provider);
  // Ids are the wire contract; sorting keeps the dependency string stable.
  const additionalKey = additionalDirectories
    .map((root) => root.id)
    .sort()
    .join("\u0000");

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry bumps the tick to re-prepare.
  useEffect(() => {
    generation.current += 1;
    const current = generation.current;
    const previous = heldDraft.current;
    heldDraft.current = null;
    if (previous !== null) {
      // A draft that cannot be discarded is cleaned by startup recovery.
      void client.thread.delete(previous).catch(() => {});
    }

    if (workspaceId === null || workspacePath === null || providerId === null) {
      setState({ status: "idle", bootstrap: null, error: null });
      return;
    }
    if (!selectable) {
      setState({
        status: "error",
        bootstrap: null,
        error: "Provider is not ready",
      });
      return;
    }

    setState({ status: "preparing", bootstrap: null, error: null });
    void (async () => {
      try {
        const bootstrap = await client.thread.prepare({
          workspace_id: workspaceId,
          agent_profile_id: providerId,
          workdir: workspacePath,
          additional_directories:
            additionalKey === "" ? [] : additionalKey.split("\u0000"),
          isolation,
        });
        if (generation.current !== current) {
          void client.thread.delete(bootstrap.thread.id).catch(() => {});
          return;
        }
        heldDraft.current = bootstrap.thread.id;
        setState({ status: "ready", bootstrap, error: null });
      } catch (error) {
        if (generation.current !== current) return;
        setState({
          status: isAuthRequired(error) ? "auth-required" : "error",
          bootstrap: null,
          error: errorMessage(error),
        });
      }
    })();
  }, [
    client,
    workspaceId,
    workspacePath,
    providerId,
    selectable,
    additionalKey,
    isolation,
    retryTick,
  ]);

  useEffect(
    () => () => {
      generation.current += 1;
      const held = heldDraft.current;
      heldDraft.current = null;
      if (held !== null) {
        // Best-effort: an orphaned draft is removed by startup recovery.
        void client.thread.delete(held).catch(() => {});
      }
    },
    [client],
  );

  return {
    ...state,
    release() {
      heldDraft.current = null;
      setState({ status: "idle", bootstrap: null, error: null });
    },
    retry() {
      setRetryTick((tick) => tick + 1);
    },
  };
}
