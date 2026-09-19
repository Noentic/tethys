import { ArrowUp, ChevronDown, FolderClosed, Warning } from "@nebutra/icons";
import {
  ActionIconButton,
  Badge,
  Listbox,
  Popover,
  Select,
  StatusDot,
  Textarea,
} from "@tethys/ui";
import type React from "react";
import { useState } from "react";

export interface ThreadNewViewProps {
  onStartSession?: (
    workspaceId: string,
    providerId: string,
    modelId: string,
    prompt: string,
  ) => void;
}

interface WorkspaceOption {
  id: string;
  name: string;
  path: string;
  sourceKind: string;
}

const TRUSTED_WORKSPACES: WorkspaceOption[] = [
  {
    id: "tethys",
    name: "tethys",
    path: "~/Code/tethys",
    sourceKind: "Git · GitHub",
  },
];

interface ProviderOption {
  id: string;
  name: string;
  status: "healthy" | "auth_required" | "missing";
  models: string[];
  capabilities: string[];
}

const ACP_PROVIDERS: ProviderOption[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    status: "healthy",
    models: ["Claude 3.5 Sonnet", "Claude 3.7 Sonnet", "Claude 3.5 Haiku"],
    capabilities: ["session.resume", "mcp: stdio", "elicitation"],
  },
  {
    id: "opencode",
    name: "OpenCode",
    status: "healthy",
    models: ["Default Agent", "Code Specialist"],
    capabilities: ["mcp: stdio"],
  },
  {
    id: "codex-cli",
    name: "Codex CLI",
    status: "missing",
    models: ["codex-mini", "codex-standard"],
    capabilities: ["mcp: stdio"],
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    status: "auth_required",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    capabilities: ["session.resume", "mcp: stdio"],
  },
];

// workspace-selector-pill / model-selector-pill: transparent, 28px, sm radius.
const PILL_CLASS =
  "focus-ring flex h-7 items-center gap-1.5 rounded-sm px-2 text-label-md text-(--tethys-text-secondary) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)";

const SECTION_LABEL_CLASS =
  "px-3 py-1 text-label-sm text-(--tethys-text-muted) uppercase tracking-wider";

export function ThreadNewView({ onStartSession }: ThreadNewViewProps) {
  const [prompt, setPrompt] = useState<string>("");
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceOption>(
    TRUSTED_WORKSPACES[0],
  );
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption>(
    ACP_PROVIDERS[0],
  );
  const [selectedModel, setSelectedModel] = useState<string>(
    ACP_PROVIDERS[0].models[0],
  );
  const [selectedEffort, setSelectedEffort] = useState<string>("Medium");

  const [workspacePickerOpen, setWorkspacePickerOpen] =
    useState<boolean>(false);
  const [providerPickerOpen, setProviderPickerOpen] = useState<boolean>(false);

  const canSubmit = prompt.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onStartSession?.(
      selectedWorkspace.id,
      selectedProvider.id,
      selectedModel,
      prompt,
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-12 pb-[12vh]">
      {/* Hero Greeting (display-lg, outside the card) */}
      <h1 className="mb-xl text-center text-display-lg text-(--tethys-text-primary) select-none">
        What are we building today?
      </h1>

      {/* prompt-card: Level 3 surface, lit top edge, 2xl radius */}
      <div className="edge-lit w-full max-w-(--layout-prompt-width) rounded-2xl border border-(--tethys-hairline-strong) bg-(--tethys-surface-elevated) p-lg transition-colors focus-within:border-(--tethys-text-muted)">
        <form onSubmit={handleSubmit} className="flex flex-col gap-md">
          {/* workspace-selector-pill */}
          <div className="relative self-start">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={workspacePickerOpen}
              onClick={() => setWorkspacePickerOpen((prev) => !prev)}
              className={PILL_CLASS}
            >
              <FolderClosed className="size-4 text-(--tethys-text-muted)" />
              <span className="text-(--tethys-text-primary)">
                {selectedWorkspace.name}
              </span>
              <span className="font-mono text-mono-micro text-(--tethys-text-muted)">
                {selectedWorkspace.sourceKind}
              </span>
              <ChevronDown className="size-3.5 text-(--tethys-text-muted)" />
            </button>

            <Popover
              open={workspacePickerOpen}
              onClose={() => setWorkspacePickerOpen(false)}
              className="top-full left-0 mt-1.5"
            >
              <div className="w-72">
                <div className={SECTION_LABEL_CLASS}>Trusted Workspaces</div>
                <Listbox
                  label="Trusted workspaces"
                  selectedId={selectedWorkspace.id}
                  items={TRUSTED_WORKSPACES.map((ws) => ({
                    id: ws.id,
                    value: ws,
                    label: ws.name,
                    sublabel: ws.path,
                  }))}
                  onSelect={(item) => {
                    setSelectedWorkspace(item.value);
                    setWorkspacePickerOpen(false);
                  }}
                />
              </div>
            </Popover>
          </div>

          {/* Prompt input */}
          <Textarea
            bare
            rows={3}
            placeholder="Ask Anything..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[96px] px-1"
          />

          {/* Bottom action row */}
          <div className="flex items-center justify-between">
            {/* model-selector-pill */}
            <div className="relative">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={providerPickerOpen}
                onClick={() => setProviderPickerOpen((prev) => !prev)}
                className={PILL_CLASS}
              >
                <StatusDot status={selectedProvider.status} inline />
                <span className="text-(--tethys-text-primary)">
                  {selectedProvider.name}
                </span>
                <span className="font-mono text-mono-micro text-(--tethys-text-muted)">
                  {selectedModel} · {selectedEffort}
                </span>
                <ChevronDown className="size-3.5 text-(--tethys-text-muted)" />
              </button>

              <Popover
                open={providerPickerOpen}
                onClose={() => setProviderPickerOpen(false)}
                className="top-full left-0 mt-1.5"
              >
                {/* Provider list (200px) + session-config panel */}
                <div className="flex h-[300px] w-(--layout-popover-selector) divide-x divide-(--tethys-hairline) overflow-hidden">
                  <div className="flex w-[200px] shrink-0 flex-col overflow-y-auto">
                    <div className={SECTION_LABEL_CLASS}>ACP Providers</div>
                    <Listbox
                      label="ACP providers"
                      selectedId={selectedProvider.id}
                      items={ACP_PROVIDERS.map((prov) => ({
                        id: prov.id,
                        value: prov,
                        label: prov.name,
                        icon: <StatusDot status={prov.status} inline />,
                        sublabel:
                          prov.status !== "healthy" ? (
                            <Warning className="size-3 text-(--tethys-status-warning)" />
                          ) : undefined,
                        disabled: prov.status !== "healthy",
                      }))}
                      onSelect={(item) => {
                        setSelectedProvider(item.value);
                        setSelectedModel(item.value.models[0]);
                      }}
                    />
                  </div>

                  <div className="flex flex-1 flex-col gap-md overflow-y-auto p-md">
                    <div className="flex flex-col gap-sm border-b border-(--tethys-hairline) pb-md">
                      <span className="text-heading-md text-(--tethys-text-primary)">
                        {selectedProvider.name} Configuration
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {selectedProvider.capabilities.map((cap) => (
                          <Badge key={cap} variant="muted">
                            {cap}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="model-select"
                        className="text-label-md text-(--tethys-text-muted)"
                      >
                        Model
                      </label>
                      <Select
                        id="model-select"
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                      >
                        {selectedProvider.models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="effort-select"
                        className="text-label-md text-(--tethys-text-muted)"
                      >
                        Thinking Effort
                      </label>
                      <Select
                        id="effort-select"
                        value={selectedEffort}
                        onChange={(e) => setSelectedEffort(e.target.value)}
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </Select>
                    </div>
                  </div>
                </div>
              </Popover>
            </div>

            <ActionIconButton
              type="submit"
              label="Submit prompt"
              ready={canSubmit}
              disabled={!canSubmit}
            >
              <ArrowUp className="size-4" />
            </ActionIconButton>
          </div>
        </form>
      </div>
    </div>
  );
}
