//! The docked in-thread `prompt-card` (DESIGN.md `prompt-card`; spec §4). The
//! composer for `/thread/:id`: a context bar across the top, the editor, the
//! staged-prompt list, and a lower bar with the Model and Effort chips and the
//! one action button. It owns what the retired 56px action bar used to slot in.

import type { ContentBlock } from "@tethys/bindings";
import { ComposerEditor, type EditorHandle } from "@tethys/composer";
import {
  createPromptQueueStore,
  enqueuePrompt,
  type PromptQueueClient,
} from "@tethys/state";
import { ActionIconButton, cn, StopControl } from "@tethys/ui";
import type React from "react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useSessionState } from "../inspector/use-session-state";
import { ComposerConfigChips } from "./config-chips";
import { ContextBar } from "./context-bar";
import {
  type ComposerClient,
  commandSource,
  pathSource,
  skillSource,
} from "./popups";
import { PromptQueue } from "./queue";

/**
 * The client calls the docked composer makes. A client without them (a preview,
 * a test) has no composer, so `InspectorScreen` mounts the card only when the
 * whole slice is there.
 */
export type DockedComposerClient = ComposerClient &
  PromptQueueClient & {
    thread: PromptQueueClient["thread"] & {
      prompt(id: string, blocks: ContentBlock[]): Promise<void>;
      cancel(id: string): Promise<void>;
      setConfigOption(
        id: string,
        optionId: string,
        value: string,
      ): Promise<void>;
    };
  };

export interface DockedPromptCardProps {
  sessionId: string;
  client: DockedComposerClient;
  /** A workspace with no git: `no git` in the isolation pill, and no diff pill. */
  noGit?: boolean;
  /** Reach the editor from outside (focus, tests). */
  editorRef?: React.RefObject<EditorHandle | null>;
  /** The provider pill, the anchor a Provider request popover mounts on. */
  providerAnchorRef?: React.Ref<HTMLButtonElement>;
  className?: string;
}

const TURN_IN_FLIGHT = ["running", "awaiting_approval"];

export function DockedPromptCard({
  sessionId,
  client,
  noGit = false,
  editorRef: externalEditorRef,
  providerAnchorRef,
  className,
}: DockedPromptCardProps) {
  const state = useSessionState(sessionId);
  const ownEditorRef = useRef<EditorHandle>(null);
  const editorRef = externalEditorRef ?? ownEditorRef;
  const [queueStore] = useState(() => createPromptQueueStore());
  const queueCount = useSyncExternalStore(
    useCallback(
      (onChange) => {
        const subscription = queueStore.subscribe(onChange);
        return () => subscription.unsubscribe();
      },
      [queueStore],
    ),
    () => queueStore.state.items.length,
  );
  const [hasText, setHasText] = useState(false);
  const submitting = useRef(false);

  // A turn is in flight from the first chunk until its stop reason, including
  // while it waits on the user: a prompt sent then is queued, not interleaved.
  const turnInFlight = TURN_IN_FLIGHT.includes(state.status);
  const stopping = state.cancellationState !== "idle";

  const sources = useMemo(
    () => ({
      command: commandSource(
        client,
        state.workspaceId,
        state.agentCommands,
        state.providerId,
      ),
      skill: skillSource(),
      path: pathSource(client, state.workspaceId),
    }),
    [client, state.workspaceId, state.agentCommands, state.providerId],
  );

  const values = useMemo(
    () =>
      Object.fromEntries(
        state.configOptions.map((option) => [option.id, option.current_value]),
      ),
    [state.configOptions],
  );

  const setOption = async (optionId: string, value: string) => {
    try {
      await client.thread.setConfigOption(sessionId, optionId, value);
    } finally {
      // Whether the Provider took it or rejected it, the user is still
      // composing: hand focus back to the editor.
      editorRef.current?.focus();
    }
  };

  const modeOption = state.configOptions.find(
    (option) => option.category === "mode",
  );
  const slotData = {
    mode: {
      options: state.configOptions,
      onChange: (value: string) => {
        if (modeOption) void setOption(modeOption.id, value);
      },
    },
    "queue-count": { count: queueCount },
  };

  const submit = async () => {
    // A second submit before the first settles must not send twice.
    if (submitting.current) return;
    const text = editorRef.current?.serializeToPrompt().trim() ?? "";
    if (text === "") return;
    submitting.current = true;
    try {
      const blocks = [{ Text: text }] as ContentBlock[];
      if (turnInFlight) {
        await enqueuePrompt(queueStore, client, sessionId, blocks);
      } else {
        await client.thread.prompt(sessionId, blocks);
      }
      editorRef.current?.clear();
      setHasText(false);
    } catch {
      // Leave the text in the editor so nothing the user wrote is lost.
    } finally {
      submitting.current = false;
    }
  };

  return (
    // prompt-card: Level 3 surface, lit top edge, 2xl radius, and a width that
    // yields to the window: min(prompt-width, 100% - 96px).
    <div
      data-testid="docked-prompt-card"
      className={cn(
        "edge-lit mx-auto flex w-[min(var(--layout-prompt-width),calc(100%-96px))] flex-col gap-md rounded-2xl border border-(--tethys-hairline-strong) bg-(--tethys-surface-elevated) p-lg transition-colors focus-within:border-(--tethys-text-muted)",
        className,
      )}
    >
      <ContextBar
        sessionId={sessionId}
        providerName={state.providerId}
        branchName={state.branchName}
        noGit={noGit}
        configOptions={state.configOptions}
        values={values}
        onSetOption={setOption}
        queueCount={queueCount}
        slotData={slotData}
        providerAnchorRef={providerAnchorRef}
      />

      <PromptQueue client={client} threadId={sessionId} store={queueStore} />

      <ComposerEditor
        ref={editorRef}
        sources={sources}
        placeholder={
          turnInFlight
            ? "Queue a follow-up…  (Ctrl/Cmd+Enter)"
            : "Ask Anything…"
        }
        onChange={(text) => setHasText(text.trim().length > 0)}
        onSubmit={() => void submit()}
      />

      <div className="flex items-center justify-between gap-sm">
        <ComposerConfigChips
          options={state.configOptions}
          values={values}
          providerName={state.providerId}
          onSetOption={setOption}
        />

        {turnInFlight || stopping ? (
          <StopControl
            phase={state.cancellationState}
            graceDeadline={state.graceDeadline}
            onStop={() => void client.thread.cancel(sessionId)}
          />
        ) : (
          <ActionIconButton
            label="Send prompt"
            ready={hasText}
            disabled={!hasText}
            onClick={() => void submit()}
          >
            <span aria-hidden="true">{"↑"}</span>
          </ActionIconButton>
        )}
      </div>
    </div>
  );
}
