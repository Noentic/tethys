//! `prompt-card` (DESIGN.md; spec §3) — the new-thread composer with the
//! three-precondition submit gate.

import type { AgentCommand } from "@tethys/bindings";
import { ComposerEditor, type EditorHandle } from "@tethys/composer";
import {
  hasSelectableProvider,
  isProviderSelectable,
  type ProviderConnection,
  type TrustedWorkspace,
} from "@tethys/state";
import { ActionIconButton } from "@tethys/ui";
import { useMemo, useRef, useState } from "react";
import {
  type ComposerClient,
  commandSource,
  pathSource,
  skillSource,
} from "../composer/popups";
import { ModelSelector } from "./model-selector";
import { WorkspaceSelector } from "./workspace-selector";

const ZERO_PROVIDER_PLACEHOLDER =
  "Connect a provider in Settings to send a message";

export interface PromptCardProps {
  client: ComposerClient;
  providers?: ProviderConnection[];
  workspaces?: TrustedWorkspace[];
  initialWorkspace?: TrustedWorkspace | null;
  /** Provider commands; empty on `/thread/new` (no live session). */
  agentCommands?: AgentCommand[];
  /** Pending staged prompts; non-zero lets an empty editor still submit. */
  queuedCount?: number;
  disabled?: boolean;
  onStart: (input: {
    workspace: TrustedWorkspace;
    provider: ProviderConnection;
    promptText: string;
    changedConfig: Record<string, string>;
  }) => unknown;
}

function defaultConfig(
  provider: ProviderConnection | null,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const option of provider?.configSchema ?? []) {
    values[option.id] = option.current_value;
  }
  return values;
}

function changedConfig(
  provider: ProviderConnection | null,
  values: Record<string, string>,
): Record<string, string> {
  const changed: Record<string, string> = {};
  for (const option of provider?.configSchema ?? []) {
    const value = values[option.id];
    if (value !== undefined && value !== option.current_value) {
      changed[option.id] = value;
    }
  }
  return changed;
}

export function PromptCard({
  client,
  providers,
  workspaces,
  initialWorkspace = null,
  agentCommands = [],
  queuedCount = 0,
  disabled = false,
  onStart,
}: PromptCardProps) {
  const editorRef = useRef<EditorHandle>(null);
  const [workspace, setWorkspace] = useState<TrustedWorkspace | null>(
    initialWorkspace,
  );
  const [providerId, setProviderId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [promptText, setPromptText] = useState("");

  const providerList = providers ?? [];
  const selectedProvider =
    providerList.find((provider) => provider.id === providerId) ?? null;
  const anySelectable = hasSelectableProvider(providerList);
  const zeroProvider = !anySelectable;

  const sources = useMemo(
    () => ({
      command: commandSource(
        client,
        workspace?.id,
        agentCommands,
        selectedProvider?.name ?? "Agent",
      ),
      skill: skillSource(),
      path: pathSource(client, workspace?.id),
    }),
    [client, workspace?.id, agentCommands, selectedProvider?.name],
  );

  const submitDisabled =
    disabled ||
    workspace === null ||
    !anySelectable ||
    (promptText.trim().length === 0 && queuedCount === 0);

  const submit = () => {
    if (submitDisabled || !workspace || !selectedProvider) return;
    const promptTextNow = editorRef.current?.serializeToPrompt() ?? promptText;
    void onStart({
      workspace,
      provider: selectedProvider,
      promptText: promptTextNow,
      changedConfig: changedConfig(selectedProvider, values),
    });
  };

  const handleSelectProvider = (provider: ProviderConnection) => {
    if (!isProviderSelectable(provider)) return;
    setProviderId(provider.id);
    setValues(defaultConfig(provider));
  };

  return (
    // prompt-card: Level 3 surface, lit top edge, 2xl radius
    <div className="edge-lit w-full max-w-(--layout-prompt-width) rounded-2xl border border-(--tethys-hairline-strong) bg-(--tethys-surface-elevated) p-lg transition-colors focus-within:border-(--tethys-text-muted)">
      <form
        className="flex flex-col gap-md"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <WorkspaceSelector
          workspaces={workspaces}
          selected={workspace}
          onSelect={setWorkspace}
        />

        <ComposerEditor
          ref={editorRef}
          sources={sources}
          disabled={disabled || zeroProvider}
          placeholder={
            zeroProvider ? ZERO_PROVIDER_PLACEHOLDER : "Ask Anything…"
          }
          onChange={setPromptText}
          onSubmit={submit}
        />

        <div className="flex items-center justify-between">
          <ModelSelector
            providers={providerList}
            selectedProviderId={providerId}
            onSelectProvider={handleSelectProvider}
            values={values}
            onConfigChange={(optionId, value) =>
              setValues((prev) => ({ ...prev, [optionId]: value }))
            }
          />

          <ActionIconButton
            type="submit"
            label="Submit prompt"
            ready={!submitDisabled}
            disabled={submitDisabled}
          >
            <span aria-hidden="true">{"\u2191"}</span>
          </ActionIconButton>
        </div>
      </form>
    </div>
  );
}
