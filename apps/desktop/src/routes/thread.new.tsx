import {
  ArrowUp,
  Check,
  ChevronDown,
  FolderClosed,
  Sparkles,
  Warning,
} from "@nebutra/icons";
import { Popover, Textarea } from "@tethys/ui";
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    onStartSession?.(
      selectedWorkspace.id,
      selectedProvider.id,
      selectedModel,
      prompt,
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (prompt.trim()) {
        onStartSession?.(
          selectedWorkspace.id,
          selectedProvider.id,
          selectedModel,
          prompt,
        );
      }
    }
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center -mt-10 bg-(--tethys-canvas) px-4">
      {/* Hero Greeting */}
      <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-white mb-6 text-center select-none">
        What are we building today?
      </h1>

      {/* Rounded Prompt Card Frame (Fixed 680px - 720px, §3) */}
      <div className="w-full max-w-[700px] rounded-2xl border border-(--tethys-hairline) bg-(--tethys-surface-panel) p-4 shadow-2xl focus-within:border-(--tethys-hairline-strong) transition-all">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Top Row: Workspace Selector Pill (§3) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setWorkspacePickerOpen((prev) => !prev)}
              className="flex h-7 items-center gap-1.5 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-elevated) px-2.5 text-xs text-(--tethys-text-secondary) hover:text-(--tethys-text-primary) hover:bg-(--tethys-surface-hover) transition-colors outline-none focus-visible:ring-1 focus-visible:ring-(--tethys-accent-focus)"
            >
              <FolderClosed className="size-3.5 text-(--tethys-accent-focus)" />
              <span className="font-semibold text-(--tethys-text-primary)">
                {selectedWorkspace.name}
              </span>
              <span className="font-mono text-[10px] text-(--tethys-text-muted)">
                {selectedWorkspace.sourceKind}
              </span>
              <ChevronDown className="size-3 opacity-60 ml-0.5" />
            </button>

            <Popover
              open={workspacePickerOpen}
              onClose={() => setWorkspacePickerOpen(false)}
              className="top-full left-0 mt-1.5"
            >
              <div className="w-72 p-2 flex flex-col gap-1 overflow-y-auto max-h-64">
                <span className="text-[10px] font-semibold text-(--tethys-text-muted) uppercase tracking-wider px-2 py-1">
                  Trusted Workspaces (cwd)
                </span>
                {TRUSTED_WORKSPACES.map((ws) => (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => {
                      setSelectedWorkspace(ws);
                      setWorkspacePickerOpen(false);
                    }}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs text-left transition-colors ${
                      selectedWorkspace.id === ws.id
                        ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) font-medium"
                        : "text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)"
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold truncate text-(--tethys-text-primary)">
                        {ws.name}
                      </span>
                      <span className="font-mono text-[10px] text-(--tethys-text-muted) truncate">
                        {ws.path}
                      </span>
                    </div>
                    {selectedWorkspace.id === ws.id && (
                      <Check className="size-3.5 text-(--tethys-accent-focus) shrink-0 ml-2" />
                    )}
                  </button>
                ))}
              </div>
            </Popover>
          </div>

          {/* Prompt Input Area */}
          <Textarea
            rows={3}
            placeholder="Ask Anything..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full resize-none bg-transparent border-0 p-1 text-sm sm:text-base leading-relaxed focus:outline-none focus-visible:ring-0 placeholder:text-(--tethys-text-muted) min-h-[96px] text-(--tethys-text-primary)"
          />

          {/* Bottom Action Row */}
          <div className="flex items-center justify-between pt-1">
            {/* Model & Provider Selector Pill (§3) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setProviderPickerOpen((prev) => !prev)}
                className="flex h-8 items-center gap-2 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-elevated) px-3 text-xs text-(--tethys-text-primary) hover:bg-(--tethys-surface-hover) transition-colors outline-none focus-visible:ring-1 focus-visible:ring-(--tethys-accent-focus)"
              >
                <Sparkles className="size-3.5 text-(--tethys-accent-focus)" />
                <span className="font-medium">
                  {selectedProvider.name} · {selectedModel} · {selectedEffort}
                </span>
                <ChevronDown className="size-3.5 opacity-60" />
              </button>

              <Popover
                open={providerPickerOpen}
                onClose={() => setProviderPickerOpen(false)}
                className="top-full left-0 mt-1.5"
              >
                {/* Two-Column Popover: 200px Providers + 340px Parameters (§3) */}
                <div className="flex w-[540px] h-[300px] divide-x divide-(--tethys-hairline) overflow-hidden rounded-xl bg-(--tethys-surface-elevated)">
                  {/* Column 1: ACP Providers (200px) */}
                  <div className="w-[200px] p-2 flex flex-col gap-1 overflow-y-auto shrink-0">
                    <span className="text-[10px] font-semibold text-(--tethys-text-muted) uppercase tracking-wider px-2 py-1">
                      ACP Providers
                    </span>
                    {ACP_PROVIDERS.map((prov) => (
                      <button
                        key={prov.id}
                        type="button"
                        onClick={() => {
                          if (prov.status === "healthy") {
                            setSelectedProvider(prov);
                            setSelectedModel(prov.models[0]);
                          }
                        }}
                        className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs text-left transition-colors ${
                          selectedProvider.id === prov.id
                            ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) font-medium"
                            : prov.status === "healthy"
                              ? "text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)"
                              : "text-(--tethys-text-muted) opacity-60 cursor-not-allowed"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className={`size-2 rounded-full shrink-0 ${
                              prov.status === "healthy"
                                ? "bg-emerald-500"
                                : prov.status === "auth_required"
                                  ? "bg-amber-400"
                                  : "bg-red-500"
                            }`}
                          />
                          <span className="truncate">{prov.name}</span>
                        </div>
                        {prov.status !== "healthy" && (
                          <Warning className="size-3 text-(--tethys-status-warning) shrink-0 ml-1" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Column 2: Provider Parameters & Schema (340px) */}
                  <div className="flex-1 p-3.5 flex flex-col gap-3 overflow-y-auto">
                    <div className="flex flex-col gap-1 border-b border-(--tethys-hairline) pb-2">
                      <span className="text-xs font-semibold text-(--tethys-text-primary)">
                        {selectedProvider.name} Configuration
                      </span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {selectedProvider.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="rounded bg-(--tethys-surface-panel) px-1.5 py-0.5 font-mono text-[9px] text-(--tethys-text-muted) border border-(--tethys-hairline)"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Model Select */}
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="model-select"
                        className="text-[11px] font-medium text-(--tethys-text-muted)"
                      >
                        Model
                      </label>
                      <select
                        id="model-select"
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="h-8 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-panel) px-2.5 text-xs text-(--tethys-text-primary) outline-none focus:border-(--tethys-hairline-strong)"
                      >
                        {selectedProvider.models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Reasoning Effort */}
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="effort-select"
                        className="text-[11px] font-medium text-(--tethys-text-muted)"
                      >
                        Thinking Effort
                      </label>
                      <select
                        id="effort-select"
                        value={selectedEffort}
                        onChange={(e) => setSelectedEffort(e.target.value)}
                        className="h-8 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-panel) px-2.5 text-xs text-(--tethys-text-primary) outline-none focus:border-(--tethys-hairline-strong)"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>
                  </div>
                </div>
              </Popover>
            </div>

            {/* Circular Arrow Up Submit Button */}
            <button
              type="submit"
              disabled={!prompt.trim()}
              aria-label="Submit prompt"
              className={`flex size-8 items-center justify-center rounded-full transition-all ${
                prompt.trim()
                  ? "bg-white text-black hover:bg-white/90 shadow-md cursor-pointer"
                  : "bg-white/10 text-white/40 cursor-not-allowed"
              }`}
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
