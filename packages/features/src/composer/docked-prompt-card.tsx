//! The docked in-thread `prompt-card` (DESIGN.md `prompt-card`; spec §4). The
//! composer for `/thread/:id`: a context bar across the top, the editor, the
//! staged-prompt list, and a lower bar with the Model and Effort chips and the
//! one action button. It owns what the retired 56px action bar used to slot in.

import type { ContentBlock } from "@tethys/bindings";
import {
  COMPOSER_CONTROL_SHORTCUT_EVENT,
  COMPOSER_INSERT_CHIP_EVENT,
  type ComposerControl,
  type ComposerControlShortcut,
  ComposerEditor,
  type EditorChip,
  type EditorHandle,
} from "@tethys/composer";
import {
  createPromptQueueStore,
  enqueuePrompt,
  getOrCreateSessionStore,
  type PromptQueueClient,
} from "@tethys/state";
import { ActionIconButton, cn, StopControl } from "@tethys/ui";
import type React from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { RequestDock } from "../approvals/request-dock";
import { useSessionState } from "../inspector/use-session-state";
import { BranchBar } from "../review/branch-bar";
import {
  AttachmentPicker,
  type ComposerAttachment,
  ComposerAttachmentChip,
} from "./attachments";
import { ComposerConfigChips } from "./config-chips";
import { ContextBar, formatUsage } from "./context-bar";
import {
  type ComposerClient,
  commandSource,
  pathSource,
  skillSource,
} from "./popups";
import { promptContentBlocks } from "./prompt-blocks";
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
      respondExtension?: (
        id: string,
        requestId: string,
        response: unknown,
      ) => Promise<void>;
      resume?: (id: string) => Promise<void>;
      setPermissionMode?: (
        id: string,
        mode: import("@tethys/bindings").PermissionMode,
      ) => Promise<void>;
    };
  };

export interface DockedPromptCardProps {
  sessionId: string;
  client: DockedComposerClient;
  /** A workspace with no git: `no git` in the isolation pill, and no diff pill. */
  noGit?: boolean;
  worktreeEnabled?: boolean;
  workspaceName?: string;
  /** Reach the editor from outside (focus, tests). */
  editorRef?: React.RefObject<EditorHandle | null>;
  /** The provider pill, the anchor a Provider request popover mounts on. */
  providerAnchorRef?: React.Ref<HTMLButtonElement>;
  className?: string;
}

const TURN_IN_FLIGHT = ["running", "awaiting_approval"];
const PROMPT_PLACEHOLDER = "Ask Anything…";

function RunningSpinner() {
  return (
    <svg
      className="h-4 w-4 motion-safe:animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

export function DockedPromptCard({
  sessionId,
  client,
  noGit = false,
  worktreeEnabled = false,
  workspaceName,
  editorRef: externalEditorRef,
  providerAnchorRef,
  className,
}: DockedPromptCardProps) {
  const state = useSessionState(sessionId);
  const ownEditorRef = useRef<EditorHandle>(null);
  const editorRef = externalEditorRef ?? ownEditorRef;
  const modeTriggerRef = useRef<HTMLButtonElement>(null);
  const providerTriggerRef = providerAnchorRef as
    | React.RefObject<HTMLButtonElement | null>
    | undefined;
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
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    const handleShortcut = (event: Event) => {
      const control = (event as CustomEvent<ComposerControlShortcut>).detail;
      if (control === "mode") modeTriggerRef.current?.click();
      else if (control === "model") providerTriggerRef?.current?.click();
      else {
        document
          .querySelector<HTMLInputElement>(
            'input[type="range"][aria-label$=" effort"]',
          )
          ?.focus();
      }
    };
    window.addEventListener(COMPOSER_CONTROL_SHORTCUT_EVENT, handleShortcut);
    return () =>
      window.removeEventListener(
        COMPOSER_CONTROL_SHORTCUT_EVENT,
        handleShortcut,
      );
  }, [providerTriggerRef]);

  useEffect(() => {
    const handleInsertChip = (event: Event) => {
      const chip = (event as CustomEvent<EditorChip>).detail;
      if (!chip) return;
      editorRef.current?.insertChip(chip);
      editorRef.current?.focus();
    };
    window.addEventListener(COMPOSER_INSERT_CHIP_EVENT, handleInsertChip);
    return () =>
      window.removeEventListener(COMPOSER_INSERT_CHIP_EVENT, handleInsertChip);
  }, [editorRef]);

  // A turn is in flight from the first chunk until its stop reason, including
  // while it waits on the user: a prompt sent then is queued, not interleaved.
  const turnInFlight = TURN_IN_FLIGHT.includes(state.status);
  const stopping = state.cancellationState !== "idle";
  const hasPrompt = hasText || attachments.length > 0;

  const sources = useMemo(
    () => ({
      command: commandSource(
        client,
        state.workspaceId,
        state.agentCommands,
        state.providerId,
      ),
      skill: skillSource(client, state.workspaceId),
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
  const setPermissionMode = (
    mode: import("@tethys/bindings").PermissionMode,
  ) => {
    getOrCreateSessionStore(sessionId).setState((previous) => ({
      ...previous,
      permissionMode: mode,
    }));
    void client.thread.setPermissionMode?.(sessionId, mode).catch(() => {});
  };
  const slotData = {
    mode: {
      options: state.configOptions,
      permissionMode: state.permissionMode,
      onPermissionModeChange: setPermissionMode,
      worktreeEnabled,
      providerName: state.providerId,
      workspaceName: workspaceName ?? state.workspaceId,
      onMakeDefault: () => {
        try {
          localStorage.setItem(
            `tethys:permission-mode:${state.workspaceId}`,
            state.permissionMode,
          );
        } catch {
          // The current thread setting still works without browser storage.
        }
      },
      triggerRef: modeTriggerRef,
      onChange: (value: string) => {
        if (modeOption) void setOption(modeOption.id, value);
      },
    },
    "queue-count": { count: queueCount },
  };

  const handleComposerControl = (control: ComposerControl) => {
    switch (control) {
      case "model":
      case "config":
        providerTriggerRef?.current?.click();
        break;
      case "permissions":
        modeTriggerRef.current?.click();
        break;
      case "clear":
        editorRef.current?.clear();
        setHasText(false);
        break;
      case "resume":
        void client.thread.resume?.(sessionId).catch(() => {});
        break;
    }
  };

  const submit = async () => {
    // A second submit before the first settles must not send twice.
    if (submitting.current) return;
    const text = editorRef.current?.serializeToPrompt().trim() ?? "";
    if (text === "" && attachments.length === 0) return;
    submitting.current = true;
    try {
      const parts = editorRef.current?.serializeToPromptParts() ?? [
        { kind: "text" as const, text },
      ];
      const blocks = promptContentBlocks(parts, attachments, state.workdir);
      if (turnInFlight) {
        await enqueuePrompt(queueStore, client, sessionId, blocks);
      } else {
        await client.thread.prompt(sessionId, blocks);
      }
      editorRef.current?.clear();
      setAttachments([]);
      setHasText(false);
      setSendError(null);
    } catch (cause) {
      // Leave the text in the editor so nothing the user wrote is lost, and say
      // what happened: a send that fails silently reads as a dead button.
      setSendError(cause instanceof Error ? cause.message : String(cause));
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
        "edge-lit mx-auto flex w-[min(var(--layout-prompt-width),calc(100%_-_96px))] flex-col gap-md rounded-2xl border border-(--tethys-hairline-strong) bg-(--tethys-surface-elevated) p-lg transition-colors focus-within:border-(--tethys-text-muted)",
        className,
      )}
    >
      <RequestDock entries={state.entries} />

      <BranchBar
        sessionId={sessionId}
        branchName={state.branchName}
        worktree={worktreeEnabled}
        noGit={noGit}
        turnRunning={turnInFlight}
      />

      <ContextBar
        sessionId={sessionId}
        providerName={state.providerId}
        configOptions={state.configOptions}
        values={values}
        onSetOption={setOption}
        queueCount={queueCount}
        usageText={state.usage ? formatUsage(state.usage) : undefined}
        slotData={slotData}
        providerAnchorRef={providerAnchorRef}
      />

      <PromptQueue client={client} threadId={sessionId} store={queueStore} />

      <div className="relative">
        {!hasText && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 px-1 text-body-md text-(--tethys-text-muted)"
          >
            {turnInFlight
              ? "Queue a follow-up…  (Ctrl/Cmd+Enter)"
              : PROMPT_PLACEHOLDER}
          </span>
        )}
        <ComposerEditor
          ref={editorRef}
          sources={sources}
          placeholder={
            turnInFlight
              ? "Queue a follow-up…  (Ctrl/Cmd+Enter)"
              : PROMPT_PLACEHOLDER
          }
          onChange={(text) => setHasText(text.trim().length > 0)}
          onControl={handleComposerControl}
          onSubmit={() => void submit()}
        />
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-sm" data-testid="prompt-attachments">
          {attachments.map((attachment) => (
            <ComposerAttachmentChip
              key={attachment.id}
              attachment={attachment}
              onRemove={() =>
                setAttachments((current) =>
                  current.filter((item) => item.id !== attachment.id),
                )
              }
            />
          ))}
        </div>
      )}

      {sendError && (
        <p
          role="alert"
          title={sendError}
          className="text-label-sm text-(--tethys-status-danger)"
        >
          The prompt could not be sent.
        </p>
      )}

      <div className="flex items-center justify-between gap-sm">
        <div className="flex min-w-0 items-center gap-md">
          <AttachmentPicker
            providerName={state.providerId}
            capabilities={{
              image: state.capabilities?.prompt_image ?? false,
              audio: state.capabilities?.prompt_audio ?? false,
              embeddedContext:
                state.capabilities?.prompt_embedded_context ?? false,
            }}
            onAttach={(attachment) =>
              setAttachments((current) => [...current, attachment])
            }
          />
          <ComposerConfigChips
            options={state.configOptions}
            values={values}
            providerName={state.providerId}
            onSetOption={setOption}
          />
        </div>

        {stopping ? (
          <StopControl
            phase={state.cancellationState}
            graceDeadline={state.graceDeadline}
            onStop={() => void client.thread.cancel(sessionId)}
          />
        ) : turnInFlight ? (
          <ActionIconButton
            label="Stop prompt"
            ready
            onClick={() => void client.thread.cancel(sessionId)}
          >
            <RunningSpinner />
          </ActionIconButton>
        ) : (
          <ActionIconButton
            label="Send prompt"
            ready={hasPrompt}
            disabled={!hasPrompt}
            onClick={() => void submit()}
          >
            <span aria-hidden="true">{"↑"}</span>
          </ActionIconButton>
        )}
      </div>
    </div>
  );
}
