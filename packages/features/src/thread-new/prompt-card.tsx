//! `prompt-card` (DESIGN.md; spec §3) — the new-thread composer with the
//! three-precondition submit gate.

import { ArrowRight, BranchPlus, FolderPlus, Warning } from "@nebutra/icons";
import type {
  AgentCommand,
  ConfigOption,
  PermissionMode,
  ThreadBootstrap,
  ThreadIsolation,
} from "@tethys/bindings";
import {
  COMPOSER_CONTROL_SHORTCUT_EVENT,
  type ComposerControl,
  type ComposerControlShortcut,
  ComposerEditor,
  type EditorHandle,
} from "@tethys/composer";
import {
  hasSelectableProvider,
  isProviderSelectable,
  type ProviderConnection,
  type TrustedWorkspace,
  useProviderConnections,
} from "@tethys/state";
import { ActionIconButton, Chip, Listbox, Popover } from "@tethys/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AttachmentPicker,
  type ComposerAttachment,
  ComposerAttachmentChip,
} from "../composer/attachments";
import { ComposerConfigChips } from "../composer/config-chips";
import {
  type ComposerClient,
  commandSource,
  pathSource,
  skillSource,
} from "../composer/popups";
import { promptContentBlocks } from "../composer/prompt-blocks";
import { IsolationToggle } from "./isolation-toggle";
import { ModeSelector } from "./mode-selector";
import { ModelSelector } from "./model-selector";
import {
  type DraftSessionClient,
  type PreparedDraft,
  usePreparedDraft,
} from "./use-prepared-draft";
import { WorkspaceSelector } from "./workspace-selector";

const ZERO_PROVIDER_PLACEHOLDER =
  "Connect a provider in Settings to send a message";
const UNRESOLVED_WORKSPACE_PLACEHOLDER = "Choose a folder to start a thread";
const UNSELECTED_PROVIDER_PLACEHOLDER = "Choose a provider to start a thread";
const PROMPT_PLACEHOLDER =
  "Ask Claude to edit files, run bash commands, or type / for commands…";
const WORKTREE_PREFERENCE = "tethys:new-worktree:";
const PERMISSION_MODE_PREFERENCE = "tethys:permission-mode:";
const CURRENT_ISOLATION: ThreadIsolation = { kind: "current" };
// Pen `XrH5y / additional-folder pill`: matches the workspace pill.
const ADDITIONAL_PILL_CLASS =
  "focus-ring flex h-7 items-center gap-1.5 rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-card) px-2.5 text-label-md text-(--tethys-text-muted) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)";

function worktreePreference(workspaceId: string | undefined): boolean {
  if (!workspaceId || typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(`${WORKTREE_PREFERENCE}${workspaceId}`) === "1";
  } catch {
    return false;
  }
}

function defaultBranch(name: string | undefined): string {
  const slug = (name ?? "thread")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `tethys/${slug || "thread"}`;
}

function savedPermissionMode(
  workspaceId: string | undefined,
): PermissionMode | null {
  if (!workspaceId || typeof localStorage === "undefined") return null;
  try {
    const value = localStorage.getItem(
      `${PERMISSION_MODE_PREFERENCE}${workspaceId}`,
    );
    return value === "supervised" || value === "auto-edit" || value === "yolo"
      ? value
      : null;
  } catch {
    return null;
  }
}

export interface PromptCardProps {
  client: ComposerClient;
  /** `thread.prepare` / `thread.delete` for the prepared draft. */
  session: DraftSessionClient;
  providers?: ProviderConnection[];
  workspaces?: TrustedWorkspace[];
  initialWorkspace?: TrustedWorkspace | null;
  /** Provider commands; empty on `/thread/new` (no live session). */
  agentCommands?: AgentCommand[];
  /** Pending staged prompts; non-zero lets an empty editor still submit. */
  queuedCount?: number;
  onResume?: () => void;
  disabled?: boolean;
  onStart: (input: {
    workspace: TrustedWorkspace;
    provider: ProviderConnection;
    draft: ThreadBootstrap;
    promptText: string;
    changedConfig: Record<string, string>;
    blocks: import("@tethys/bindings").ContentBlock[];
  }) => unknown;
}

function defaultValues(options: ConfigOption[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const option of options) {
    values[option.id] = option.current_value;
  }
  return values;
}

function changedConfig(
  options: ConfigOption[],
  values: Record<string, string>,
): Record<string, string> {
  const changed: Record<string, string> = {};
  for (const option of options) {
    const value = values[option.id];
    if (value !== undefined && value !== option.current_value) {
      changed[option.id] = value;
    }
  }
  return changed;
}

function setupPlaceholder(input: {
  workspace: TrustedWorkspace | null;
  zeroProvider: boolean;
  selectedProvider: ProviderConnection | null;
  draft: PreparedDraft;
}): string {
  if (input.workspace === null) return UNRESOLVED_WORKSPACE_PLACEHOLDER;
  if (input.zeroProvider) return ZERO_PROVIDER_PLACEHOLDER;
  if (input.selectedProvider === null) return UNSELECTED_PROVIDER_PLACEHOLDER;
  const name = input.selectedProvider.name;
  switch (input.draft.status) {
    case "preparing":
      return `Preparing ${name}…`;
    case "auth-required":
      return `Sign in to ${name} in Settings to continue`;
    case "error":
      return `Setup failed for ${name}; change the selection to retry`;
    default:
      return PROMPT_PLACEHOLDER;
  }
}

export function PromptCard({
  client,
  session,
  providers,
  workspaces,
  initialWorkspace = null,
  agentCommands = [],
  queuedCount = 0,
  onResume,
  disabled = false,
  onStart,
}: PromptCardProps) {
  const editorRef = useRef<EditorHandle>(null);
  const modeTriggerRef = useRef<HTMLButtonElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const [workspace, setWorkspace] = useState<TrustedWorkspace | null>(
    initialWorkspace,
  );
  const [newWorktree, setNewWorktree] = useState(() =>
    worktreePreference(initialWorkspace?.id),
  );
  const [worktreeBase, setWorktreeBase] = useState("HEAD");
  const [worktreeBranch, setWorktreeBranch] = useState("");
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(
    () => savedPermissionMode(initialWorkspace?.id) ?? "supervised",
  );
  const [providerId, setProviderId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [promptText, setPromptText] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [gitInitError, setGitInitError] = useState<string | null>(null);
  const [initializingGit, setInitializingGit] = useState(false);
  const [uncommittedCount, setUncommittedCount] = useState<number | null>(null);
  const [extraRoots, setExtraRoots] = useState<TrustedWorkspace[]>([]);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const foldersAnchorRef = useRef<HTMLButtonElement>(null);

  const providerList = useProviderConnections(providers);

  // `/thread/new?workspace=<id>`: the trusted list resolves after mount, so the
  // preselection lands when it arrives and never overwrites a manual pick.
  useEffect(() => {
    if (workspace === null && initialWorkspace) {
      setWorkspace(initialWorkspace);
      setNewWorktree(worktreePreference(initialWorkspace.id));
      setWorktreeBranch("");
    }
  }, [initialWorkspace, workspace]);

  useEffect(() => {
    const handleShortcut = (event: Event) => {
      const control = (event as CustomEvent<ComposerControlShortcut>).detail;
      if (control === "mode") modeTriggerRef.current?.click();
      else if (control === "model") modelTriggerRef.current?.click();
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
  }, []);

  const selectedProvider =
    providerList.find((provider) => provider.id === providerId) ?? null;
  const anySelectable = hasSelectableProvider(providerList);
  const zeroProvider = !anySelectable;

  const worktreeIsolation = useMemo<ThreadIsolation>(
    () => ({
      kind: "worktree",
      base: worktreeBase,
      branch: worktreeBranch.trim() || null,
    }),
    [worktreeBase, worktreeBranch],
  );
  const isolation =
    newWorktree && workspace?.capabilities.vcs.kind !== "none"
      ? worktreeIsolation
      : CURRENT_ISOLATION;
  const draft = usePreparedDraft(
    session,
    workspace,
    selectedProvider,
    extraRoots,
    isolation,
  );
  const draftOptions = draft.bootstrap?.config_options ?? [];
  const draftId = draft.bootstrap?.thread.id ?? null;
  const draftReady = draft.status === "ready" && draft.bootstrap !== null;
  const modeOption = draftOptions.find((option) => option.category === "mode");

  useEffect(() => {
    setUncommittedCount(null);
    if (
      !draftId ||
      !client.git ||
      workspace?.capabilities.vcs.kind === "none"
    ) {
      return;
    }
    let active = true;
    void client.git
      .diffSummary({ HeadWorktree: { thread_id: draftId } })
      .then((summary) => {
        if (active) setUncommittedCount(summary.files.length);
      })
      .catch(() => {
        if (active) setUncommittedCount(null);
      });
    return () => {
      active = false;
    };
  }, [client.git, draftId, workspace?.capabilities.vcs.kind]);

  useEffect(() => {
    if (!draftReady || !draft.bootstrap || !draftId) return;
    const saved = savedPermissionMode(workspace?.id);
    const next = saved ?? draft.bootstrap.permission_mode;
    setPermissionMode(next);
    if (saved && saved !== draft.bootstrap.permission_mode) {
      void session.thread.setPermissionMode?.(draftId, saved).catch(() => {});
    }
  }, [draftId, draftReady, draft.bootstrap, session, workspace?.id]);

  // A ready draft replaces the panel values; a new draft resets any edits made
  // against the previous Provider's options. Guarded render-time reset (React
  // "adjusting state when props change") so the panel never paints stale values.
  const seededDraft = useRef<string | null>(null);
  if (draft.status === "ready" && draftId !== null) {
    if (seededDraft.current !== draftId) {
      seededDraft.current = draftId;
      setValues(defaultValues(draftOptions));
    }
  } else if (seededDraft.current !== null && draftId === null) {
    seededDraft.current = null;
  }

  const sources = useMemo(
    () => ({
      command: commandSource(
        client,
        workspace?.id,
        agentCommands,
        selectedProvider?.name ?? "Agent",
      ),
      skill: skillSource(client, workspace?.id),
      path: pathSource(client, workspace?.id),
    }),
    [client, workspace?.id, agentCommands, selectedProvider?.name],
  );

  const submitDisabled =
    disabled ||
    workspace === null ||
    !draftReady ||
    (promptText.trim().length === 0 &&
      attachments.length === 0 &&
      queuedCount === 0);

  const submit = () => {
    if (submitDisabled || !workspace || !selectedProvider || !draft.bootstrap) {
      return;
    }
    const promptTextNow = editorRef.current?.serializeToPrompt() ?? promptText;
    const parts = editorRef.current?.serializeToPromptParts() ?? [
      { kind: "text" as const, text: promptTextNow },
    ];
    const bootstrap = draft.bootstrap;
    setSubmitError(null);
    draft.release();
    Promise.resolve(
      onStart({
        workspace,
        provider: selectedProvider,
        draft: bootstrap,
        promptText: promptTextNow,
        changedConfig: changedConfig(draftOptions, values),
        blocks: promptContentBlocks(parts, attachments, workspace.path),
      }),
    ).catch((error: unknown) => {
      // The released draft was never promoted: prepare a replacement so the
      // selections and typed prompt can be retried.
      setSubmitError(error instanceof Error ? error.message : String(error));
      draft.retry();
    });
  };

  const handleSelectProvider = (provider: ProviderConnection) => {
    if (!isProviderSelectable(provider)) return;
    setProviderId(provider.id);
    setValues({});
  };

  const trustedFolders = workspaces ?? [];
  const checkoutInUse =
    workspace?.sessions.some((thread) => thread.workdir === workspace.path) ??
    false;
  const extraCandidates = trustedFolders.filter(
    (candidate) =>
      candidate.id !== workspace?.id &&
      !extraRoots.some((root) => root.id === candidate.id),
  );
  const handleSelectWorkspace = (next: TrustedWorkspace) => {
    setWorkspace(next);
    setNewWorktree(worktreePreference(next.id));
    setWorktreeBranch("");
    setExtraRoots((roots) => roots.filter((root) => root.id !== next.id));
  };
  const handleWorktreeChange = (enabled: boolean) => {
    setNewWorktree(enabled);
    if (workspace) {
      try {
        localStorage.setItem(
          `${WORKTREE_PREFERENCE}${workspace.id}`,
          enabled ? "1" : "0",
        );
      } catch {
        // Storage can be unavailable in private or restricted webviews.
      }
    }
  };
  const handlePermissionModeChange = (next: PermissionMode) => {
    setPermissionMode(next);
    if (draftId) {
      void session.thread.setPermissionMode?.(draftId, next).catch(() => {});
    }
  };
  const handleMakePermissionModeDefault = () => {
    if (!workspace) return;
    try {
      localStorage.setItem(
        `${PERMISSION_MODE_PREFERENCE}${workspace.id}`,
        permissionMode,
      );
    } catch {
      // Preference still applies to this thread when storage is unavailable.
    }
  };
  const initializeGit = async () => {
    if (!workspace || !session.workspace) return;
    setGitInitError(null);
    setInitializingGit(true);
    try {
      const capabilities = await session.workspace.initializeGit(workspace.id);
      setWorkspace((current) =>
        current?.id === workspace.id
          ? { ...current, capabilities, vcs: capabilities.vcs }
          : current,
      );
    } catch (error) {
      setGitInitError(error instanceof Error ? error.message : String(error));
    } finally {
      setInitializingGit(false);
    }
  };

  const handleComposerControl = (control: ComposerControl) => {
    switch (control) {
      case "model":
      case "config":
        modelTriggerRef.current?.click();
        break;
      case "permissions":
        modeTriggerRef.current?.click();
        break;
      case "clear":
        editorRef.current?.clear();
        setPromptText("");
        break;
      case "resume":
        onResume?.();
        break;
    }
  };

  // One instruction, never three: the first missing precondition names itself
  // (d0-rc10 prompt-card; pen `IAlPm`).
  const placeholder = setupPlaceholder({
    workspace,
    zeroProvider,
    selectedProvider,
    draft,
  });
  const empty = promptText.trim().length === 0;

  return (
    // prompt-card: Level 3 surface, lit top edge, 2xl radius (pen `XrH5y`).
    <div className="edge-lit w-full max-w-(--layout-prompt-width) rounded-2xl border border-(--tethys-hairline-strong) bg-(--tethys-surface-elevated) p-lg transition-colors focus-within:border-(--tethys-text-muted)">
      <form
        className="flex flex-col gap-xl"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-wrap items-center gap-md">
          <WorkspaceSelector
            workspaces={workspaces}
            selected={workspace}
            onSelect={handleSelectWorkspace}
          />

          {workspace?.capabilities.vcs.kind === "none" ? (
            <div className="flex items-center gap-sm">
              <span className="text-label-md text-(--tethys-text-muted)">
                no git · edits apply in place
              </span>
              {session.workspace && (
                <button
                  type="button"
                  className={ADDITIONAL_PILL_CLASS}
                  disabled={initializingGit}
                  onClick={() => void initializeGit()}
                >
                  {initializingGit ? "Initializing Git…" : "Initialize git"}
                </button>
              )}
            </div>
          ) : workspace ? (
            <>
              <IsolationToggle
                worktree={newWorktree}
                onChange={handleWorktreeChange}
              />
              {newWorktree ? (
                <div className="inline-flex h-7 items-stretch overflow-hidden rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-card) font-mono text-mono-micro">
                  <span className="flex items-center px-2 text-(--tethys-text-muted)">
                    from
                  </span>
                  <input
                    aria-label="Worktree base"
                    value={worktreeBase}
                    onChange={(event) => setWorktreeBase(event.target.value)}
                    className="w-16 border-l border-(--tethys-hairline) bg-transparent px-2 text-(--tethys-text-primary) outline-none focus:bg-(--tethys-surface-hover)"
                  />
                  <span
                    aria-hidden="true"
                    className="flex items-center border-l border-(--tethys-hairline) px-1.5 text-(--tethys-text-muted)"
                  >
                    <ArrowRight className="size-3" />
                  </span>
                  <input
                    aria-label="Worktree branch"
                    value={worktreeBranch}
                    placeholder={defaultBranch(workspace.name)}
                    onChange={(event) => setWorktreeBranch(event.target.value)}
                    className="w-44 border-l border-(--tethys-hairline) bg-transparent px-2 text-(--tethys-text-primary) outline-none placeholder:text-(--tethys-text-muted) focus:bg-(--tethys-surface-hover)"
                  />
                </div>
              ) : (
                uncommittedCount !== null &&
                uncommittedCount > 0 && (
                  <span className="inline-flex h-6 items-center gap-1 rounded-sm bg-(--tethys-status-warning-soft) px-2 font-mono text-mono-micro text-(--tethys-status-warning)">
                    {uncommittedCount} uncommitted
                  </span>
                )
              )}
              {checkoutInUse && !newWorktree && (
                <div
                  role="note"
                  className="flex basis-full items-center gap-sm rounded-md border border-(--tethys-hairline) bg-(--tethys-status-warning-soft) py-1.5 pr-1.5 pl-2.5 text-label-md text-(--tethys-text-secondary)"
                >
                  <Warning
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-(--tethys-status-warning)"
                  />
                  <span className="min-w-0 flex-1">
                    Another thread uses this checkout. A worktree keeps this
                    thread&apos;s changes separate.
                  </span>
                  <button
                    type="button"
                    onClick={() => handleWorktreeChange(true)}
                    className="focus-ring inline-flex h-6 shrink-0 items-center gap-1 rounded-sm px-2 text-label-md text-(--tethys-text-primary) hover:bg-(--tethys-surface-hover)"
                  >
                    <BranchPlus aria-hidden="true" className="size-3.5" />
                    Use a worktree
                  </button>
                </div>
              )}
            </>
          ) : null}

          {trustedFolders.length > 1 && (
            <div className="relative flex items-center gap-xs">
              <button
                ref={foldersAnchorRef}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={foldersOpen}
                aria-label="Additional folders"
                onClick={() => setFoldersOpen((open) => !open)}
                className={ADDITIONAL_PILL_CLASS}
              >
                <FolderPlus aria-hidden="true" className="size-3.5" />
                Folder
              </button>
              <Popover
                open={foldersOpen}
                onClose={() => setFoldersOpen(false)}
                anchorRef={foldersAnchorRef}
                className="top-full left-0 mt-1.5"
              >
                <div className="w-72">
                  <div className="px-3 py-1 text-label-sm text-(--tethys-text-muted) uppercase tracking-wider">
                    Additional Trusted Folders
                  </div>
                  {extraCandidates.length === 0 ? (
                    <p className="px-3 py-2 text-body-sm text-(--tethys-text-muted)">
                      No further trusted folders.
                    </p>
                  ) : (
                    <Listbox
                      label="Additional trusted folders"
                      items={extraCandidates.map((candidate) => ({
                        id: candidate.id,
                        value: candidate,
                        label: candidate.name,
                        sublabel: candidate.path,
                      }))}
                      onSelect={(item) => {
                        setExtraRoots((roots) => [...roots, item.value]);
                        setFoldersOpen(false);
                      }}
                    />
                  )}
                </div>
              </Popover>
              {extraRoots.map((root) => (
                <Chip
                  key={root.id}
                  onRemove={() =>
                    setExtraRoots((roots) =>
                      roots.filter((candidate) => candidate.id !== root.id),
                    )
                  }
                >
                  {root.name}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          {empty && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 px-1 text-body-md text-(--tethys-text-muted)"
            >
              {placeholder}
            </span>
          )}
          <ComposerEditor
            ref={editorRef}
            sources={sources}
            disabled={disabled}
            placeholder={placeholder}
            onControl={handleComposerControl}
            onChange={setPromptText}
            onSubmit={submit}
          />
        </div>

        {attachments.length > 0 && (
          <div
            className="flex flex-wrap gap-sm"
            data-testid="prompt-attachments"
          >
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

        {submitError !== null && (
          <p
            role="alert"
            className="text-body-sm text-(--tethys-status-danger)"
          >
            {submitError}
          </p>
        )}
        {gitInitError !== null && (
          <p
            role="alert"
            className="text-body-sm text-(--tethys-status-danger)"
          >
            Could not initialize Git: {gitInitError}
          </p>
        )}

        <div className="flex items-center justify-between gap-lg">
          <div className="flex min-w-0 items-center gap-md">
            <AttachmentPicker
              providerName={selectedProvider?.name ?? "a selected Provider"}
              capabilities={{
                image: selectedProvider?.imagePrompts ?? false,
                audio: selectedProvider?.audioPrompts ?? false,
                embeddedContext: selectedProvider?.embeddedContext ?? false,
              }}
              onAttach={(attachment) =>
                setAttachments((current) => [...current, attachment])
              }
              disabled={disabled || !selectedProvider}
            />
            {selectedProvider !== null && draftReady && modeOption && (
              <ModeSelector
                options={draftOptions}
                value={values[modeOption.id]}
                permissionMode={permissionMode}
                onPermissionModeChange={handlePermissionModeChange}
                worktreeEnabled={
                  newWorktree && workspace?.capabilities.vcs.kind !== "none"
                }
                providerName={selectedProvider.name}
                workspaceName={workspace?.name}
                onMakeDefault={handleMakePermissionModeDefault}
                triggerRef={modeTriggerRef}
                onChange={(value) =>
                  setValues((previous) => ({
                    ...previous,
                    [modeOption.id]: value,
                  }))
                }
              />
            )}
          </div>

          <div className="flex shrink-0 items-center gap-md">
            <ModelSelector
              providers={providerList}
              selectedProviderId={providerId}
              onSelectProvider={handleSelectProvider}
              values={values}
              onConfigChange={(optionId, value) =>
                setValues((prev) => ({ ...prev, [optionId]: value }))
              }
              configOptions={draftOptions}
              draftStatus={draft.status}
              draftError={draft.error}
              triggerRef={modelTriggerRef}
            />
            {draftReady && selectedProvider && (
              <ComposerConfigChips
                options={draftOptions.filter(
                  (option) => option.category === "thought_level",
                )}
                values={values}
                providerName={selectedProvider.name}
                onSetOption={async (optionId, value) => {
                  setValues((previous) => ({ ...previous, [optionId]: value }));
                }}
              />
            )}
            <kbd
              title="Command/Ctrl + Enter"
              className="font-mono text-mono-micro text-(--tethys-text-muted)"
            >
              ⌘↩
            </kbd>
            <ActionIconButton
              type="submit"
              label="Submit prompt"
              ready={!submitDisabled}
              disabled={submitDisabled}
            >
              <span aria-hidden="true">{"\u2191"}</span>
            </ActionIconButton>
          </div>
        </div>
      </form>
    </div>
  );
}
