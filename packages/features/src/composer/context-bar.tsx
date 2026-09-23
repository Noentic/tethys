//! The `prompt-card` context bar (DESIGN.md `prompt-card.contextBarFold`): the
//! row of pills across the card's top edge. It replaces the retired 56px action
//! bar, and keeps that bar's fold order.

import { ChevronDown } from "@nebutra/icons";
import type { ConfigOption } from "@tethys/bindings";
import {
  CONTEXT_BAR_PRIORITY,
  cn,
  foldContextBar,
  getAllComposerContextSlots,
  Popover,
  UNDECLARED_SLOT_PRIORITY,
} from "@tethys/ui";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { providerEntry } from "../agents/provider-catalog";
import { ProviderPendingCount } from "../providers/provider-popover";
import { SessionConfigPanel } from "../thread-new/session-config-panel";

/** Categories that already have a home on the card, so the full panel omits them. */
const HOMED_CATEGORIES = ["mode", "model", "thought_level"];

/** Options only the full panel shows: every category without a chip or pill. */
function panelOptions(options: ConfigOption[]): ConfigOption[] {
  return options.filter(
    (option) => !HOMED_CATEGORIES.includes(option.category ?? ""),
  );
}

function useContentWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState<number>(Number.POSITIVE_INFINITY);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (typeof next === "number") setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * Usage text from whatever the Provider actually reported. v1 agents report
 * `used`/`size` (stored as `total_tokens`/`context_size`), so input/output are
 * not assumed to be populated.
 */
export function formatUsage(
  usage: import("@tethys/bindings").UsageSnapshot,
): string {
  if (usage.input_tokens > 0 || usage.output_tokens > 0) {
    return `${usage.input_tokens.toLocaleString()} in · ${usage.output_tokens.toLocaleString()} out`;
  }
  const parts: string[] = [];
  if (usage.total_tokens > 0) {
    parts.push(`${usage.total_tokens.toLocaleString()} tokens`);
  }
  if (usage.context_size != null && usage.context_size > 0) {
    parts.push(`ctx ${usage.context_size.toLocaleString()}`);
  }
  if (usage.cost != null) {
    parts.push(
      usage.cost_currency
        ? `${usage.cost} ${usage.cost_currency}`
        : `${usage.cost}`,
    );
  }
  return parts.join(" · ");
}

export interface ContextBarProps {
  sessionId: string;
  providerName: string;
  /** A workspace with no git has no diff slot. */
  noGit?: boolean;
  configOptions: ConfigOption[];
  values: Record<string, string>;
  onSetOption: (optionId: string, value: string) => Promise<void>;
  queueCount: number;
  usageText?: string;
  /** Per-slot `data`, keyed by the slot's registered id. */
  slotData?: Record<string, unknown>;
  /** The provider pill; the anchor a Provider request popover mounts on. */
  providerAnchorRef?: React.Ref<HTMLButtonElement>;
  className?: string;
}

interface BarEntry {
  id: string;
  priority: number;
  node: React.ReactNode;
}

export function ContextBar({
  sessionId,
  providerName,
  noGit = false,
  configOptions,
  values,
  onSetOption,
  queueCount,
  usageText,
  slotData,
  providerAnchorRef,
  className,
}: ContextBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const width = useContentWidth(barRef);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const provider = providerEntry(providerName);
  const providerLabel = provider?.name ?? providerName;

  const entries: BarEntry[] = [
    {
      id: "provider/config",
      priority: CONTEXT_BAR_PRIORITY["provider/config"],
      node: (
        <div className="flex items-center gap-xs">
          <div className="relative">
            <button
              ref={providerAnchorRef}
              type="button"
              aria-label={
                providerLabel
                  ? `${providerLabel} provider and session configuration`
                  : "Provider and session configuration"
              }
              aria-haspopup="dialog"
              aria-expanded={configOpen}
              onClick={() => setConfigOpen((open) => !open)}
              className="focus-ring inline-flex h-7 items-center gap-2 rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-card) px-2.5 text-label-md text-(--tethys-text-primary) transition-colors hover:bg-(--tethys-surface-hover)"
            >
              {provider && (
                <img
                  src={provider.icon}
                  alt=""
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0"
                />
              )}
              {providerLabel}
              <ChevronDown
                aria-hidden="true"
                className="size-3.5 text-(--tethys-text-muted)"
              />
            </button>
            <Popover
              open={configOpen}
              onClose={() => setConfigOpen(false)}
              anchorRef={barRef}
              className="bottom-full left-0 mb-2 w-80"
            >
              <div className="flex flex-col gap-sm p-sm">
                <p className="text-label-sm text-(--tethys-text-muted)">
                  Provider is fixed for this thread — start a new thread to
                  switch
                </p>
                <SessionConfigPanel
                  options={panelOptions(configOptions)}
                  values={values}
                  onChange={(optionId, value) =>
                    void onSetOption(optionId, value)
                  }
                />
              </div>
            </Popover>
          </div>
          <ProviderPendingCount threadId={sessionId} />
        </div>
      ),
    },
  ];

  for (const [id, entry] of getAllComposerContextSlots()) {
    if (id === "diff-summary" && noGit) continue;
    const Slot = entry.component;
    entries.push({
      id,
      priority: entry.priority ?? UNDECLARED_SLOT_PRIORITY,
      node: <Slot key={id} sessionId={sessionId} data={slotData?.[id]} />,
    });
  }

  if (usageText) {
    entries.push({
      id: "usage-bar",
      priority: CONTEXT_BAR_PRIORITY["usage-bar"],
      node: (
        <span
          title={`Token usage: ${usageText}`}
          className="font-mono text-mono-code text-(--tethys-text-muted)"
        >
          {usageText}
        </span>
      ),
    });
  }

  const folded = foldContextBar(
    entries.map((entry) => ({
      id: entry.id,
      priority: entry.priority,
      present: entry.node !== null,
    })),
    width,
  );
  const rendered = entries.filter(
    (entry) => entry.node !== null && !folded.has(entry.id),
  );
  const foldedEntries = entries.filter((entry) => folded.has(entry.id));
  // A pending queue is never hidden by narrowing the window.
  const queueFolded = folded.has("queue-count") && queueCount > 0;

  return (
    <div
      ref={barRef}
      data-testid="context-bar"
      className={cn("flex min-w-0 items-center gap-md", className)}
    >
      {rendered.map((entry) => (
        <span key={entry.id} className="flex shrink-0 items-center">
          {entry.node}
        </span>
      ))}

      {folded.size > 0 && (
        <div className="relative">
          <button
            type="button"
            aria-label={`More: ${foldedEntries.map((entry) => entry.id).join(", ")}`}
            aria-haspopup="dialog"
            aria-expanded={overflowOpen}
            onClick={() => setOverflowOpen((open) => !open)}
            className="focus-ring relative flex h-7 w-7 items-center justify-center rounded-xs border border-(--tethys-hairline) bg-(--tethys-surface-hover) font-mono text-mono-micro text-(--tethys-text-secondary)"
          >
            •••
            {queueFolded && (
              <span
                data-testid="overflow-queue-dot"
                className="absolute -right-0.5 -top-0.5 inline-block size-1.5 rounded-full bg-(--tethys-status-warning)"
              />
            )}
          </button>
          <Popover
            open={overflowOpen}
            onClose={() => setOverflowOpen(false)}
            anchorRef={barRef}
            className="bottom-full left-0 mb-2 min-w-40"
          >
            {foldedEntries.map((entry) => (
              <div key={entry.id} className="px-2 py-1">
                {entry.node}
              </div>
            ))}
          </Popover>
        </div>
      )}
    </div>
  );
}
