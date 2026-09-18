import { ChevronDown, Play } from "@nebutra/icons";
import { ActionIconButton, Popover, Textarea } from "@tethys/ui";
import type React from "react";
import { useState } from "react";

export interface ThreadNewViewProps {
  onStartSession?: (
    workspaceId: string,
    modelId: string,
    prompt: string,
  ) => void;
}

export function ThreadNewView({ onStartSession }: ThreadNewViewProps) {
  const [prompt, setPrompt] = useState<string>("");
  const [selectedWorkspace, _setSelectedWorkspace] =
    useState<string>("default-workspace");
  const [selectedModel, setSelectedModel] =
    useState<string>("claude-3-7-sonnet");
  const [selectorOpen, setSelectorOpen] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    onStartSession?.(selectedWorkspace, selectedModel, prompt);
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-start pt-[20vh] bg-(--tethys-canvas) px-4">
      {/* 680px Prompt Card Frame */}
      <div className="w-full max-w-[680px] flex flex-col gap-3 rounded-xl border border-(--tethys-hairline) bg-(--tethys-surface-elevated) p-4 shadow-sm">
        {/* Top selector pills */}
        <div className="flex items-center gap-2">
          {/* Workspace selector pill */}
          <button
            type="button"
            className="flex h-7 items-center gap-1.5 rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-panel) px-2.5 text-xs text-(--tethys-text-secondary) hover:text-(--tethys-text-primary) hover:border-(--tethys-hairline-strong) transition-colors outline-none focus-visible:ring-1 focus-visible:ring-(--tethys-accent-focus)"
          >
            <span className="text-(--tethys-text-muted) font-mono">ws:</span>
            <span>{selectedWorkspace}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>

          {/* Model / Provider selector pill with two-region popover trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSelectorOpen((prev) => !prev)}
              className="flex h-7 items-center gap-1.5 rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-panel) px-2.5 text-xs text-(--tethys-text-secondary) hover:text-(--tethys-text-primary) hover:border-(--tethys-hairline-strong) transition-colors outline-none focus-visible:ring-1 focus-visible:ring-(--tethys-accent-focus)"
            >
              <span className="text-(--tethys-text-muted) font-mono">
                model:
              </span>
              <span>{selectedModel}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>

            <Popover
              open={selectorOpen}
              onClose={() => setSelectorOpen(false)}
              className="top-full left-0 mt-1"
            >
              {/* Two-region popover frame (200px list + 360px config container) */}
              <div className="flex w-[560px] h-[320px] divide-x divide-(--tethys-hairline) overflow-hidden">
                {/* Region 1: Provider / Model list (200px) */}
                <div className="w-[200px] p-2 flex flex-col gap-1 overflow-y-auto">
                  <span className="text-[10px] font-semibold text-(--tethys-text-muted) uppercase tracking-wider px-2 py-1">
                    Models
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModel("claude-3-7-sonnet");
                      setSelectorOpen(false);
                    }}
                    className={`flex items-center justify-between rounded px-2 py-1.5 text-xs text-left ${
                      selectedModel === "claude-3-7-sonnet"
                        ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) font-medium"
                        : "text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)"
                    }`}
                  >
                    Claude 3.7 Sonnet
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModel("claude-3-5-haiku");
                      setSelectorOpen(false);
                    }}
                    className={`flex items-center justify-between rounded px-2 py-1.5 text-xs text-left ${
                      selectedModel === "claude-3-5-haiku"
                        ? "bg-(--tethys-surface-active) text-(--tethys-text-primary) font-medium"
                        : "text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)"
                    }`}
                  >
                    Claude 3.5 Haiku
                  </button>
                </div>

                {/* Region 2: Model config panel container (360px) - Filled by M1.10 */}
                <div className="flex-1 p-4 flex flex-col justify-center items-center text-xs text-(--tethys-text-muted)">
                  <span>Model parameters & ACP config panel (M1.10)</span>
                </div>
              </div>
            </Popover>
          </div>
        </div>

        {/* Prompt Input Area */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Textarea
            rows={3}
            placeholder="Ask anything, describe a task, or reference files..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full resize-none bg-transparent border-0 p-0 text-sm focus-visible:ring-0 placeholder-(--tethys-text-muted)"
          />

          <div className="flex items-center justify-between pt-2 border-t border-(--tethys-hairline)">
            <span className="text-[11px] text-(--tethys-text-muted)">
              Press <kbd className="font-mono">Enter</kbd> to submit
            </span>

            <ActionIconButton
              type="submit"
              label="Start thread"
              disabled={!prompt.trim()}
              className="bg-(--tethys-primary) text-(--tethys-on-primary) hover:opacity-90"
            >
              <Play className="h-4 w-4" />
            </ActionIconButton>
          </div>
        </form>
      </div>
    </div>
  );
}
