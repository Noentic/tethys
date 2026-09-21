//! The `prompt-card` context bar (DESIGN.md `prompt-card.contextBarFold`): the
//! row of pills across the card's top edge. It replaces the retired 56px action
//! bar, and keeps that bar's fold order.

import type { ConfigOption } from "@tethys/bindings";
import {
  Badge,
  CONTEXT_BAR_PRIORITY,
  cn,
  foldContextBar,
  getAllComposerContextSlots,
  Popover,
  UNDECLARED_SLOT_PRIORITY,
} from "@tethys/ui";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { SessionConfigPanel } from "../thread-new/session-config-panel";

/** Categories that already have a home on the card, so the full panel omits them. */
const HOMED_CATEGORIES = ["mode", "model", "thought_level"];

/** Options only the full panel shows: every category without a chip or pill. */
export function panelOptions(options: ConfigOption[]): ConfigOption[] {
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

export interface ContextBarProps {
  sessionId: string;
  providerName: string;
  /** The session's branch; absent for a folder with no git. */
  branchName?: string;
  /** A workspace with no git: the isolation pill reads `no git`, and there is no diff pill. */
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
  branchName,
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

  const entries: BarEntry[] = [
    {
      id: "provider/config",
      priority: CONTEXT_BAR_PRIORITY["provider/config"],
      node: (
        <div className="relative">
          <button
            ref={providerAnchorRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={configOpen}
            onClick={() => setConfigOpen((open) => !open)}
            className="focus-ring inline-flex h-5 items-center gap-1 rounded-xs border border-(--tethys-hairline-strong) px-2 font-mono text-mono-micro text-(--tethys-text-primary) hover:bg-(--tethys-surface-hover)"
          >
            {providerName}
            <span aria-hidden="true">{"\u2228"}</span>
          </button>
          <Popover
            open={configOpen}
            onClose={() => setConfigOpen(false)}
            anchorRef={barRef}
            className="bottom-full left-0 mb-2 w-80"
          >
            <SessionConfigPanel
              options={panelOptions(configOptions)}
              values={values}
              onChange={(optionId, value) => void onSetOption(optionId, value)}
            />
          </Popover>
        </div>
      ),
    },
  ];

  for (const [id, entry] of getAllComposerContextSlots()) {
    // No git means no diff to summarise: the pill is absent, not empty.
    if (id === "diff-summary" && noGit) continue;
    const Slot = entry.component;
    entries.push({
      id,
      priority: entry.priority ?? UNDECLARED_SLOT_PRIORITY,
      node: <Slot key={id} sessionId={sessionId} data={slotData?.[id]} />,
    });
  }

  entries.push({
    id: "isolation-pill",
    priority: CONTEXT_BAR_PRIORITY["isolation-pill"],
    node: branchName ? (
      <Badge variant="outline">
        <span>{branchName}</span>
      </Badge>
    ) : noGit ? (
      <Badge variant="muted">no git</Badge>
    ) : null,
  });

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
      className={cn("flex min-w-0 items-center gap-sm", className)}
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
            className="focus-ring relative flex h-5 w-5 items-center justify-center rounded-xs border border-(--tethys-hairline) bg-(--tethys-surface-hover) font-mono text-mono-micro text-(--tethys-text-secondary)"
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
