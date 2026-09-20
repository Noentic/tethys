import type { CancellationState } from "@tethys/state";
import { Badge, getAllActionBarSlots, Popover, StopControl } from "@tethys/ui";
import { useEffect, useRef, useState } from "react";

export interface ActionBarProps {
  cancellationState: CancellationState;
  graceDeadline?: string | null;
  sessionId?: string;
  providerName?: string;
  configSummary?: string;
  mode?: string;
  worktreeBranch?: string;
  noGit?: boolean;
  queueCount?: number;
  usageText?: string;
  onStop?: () => void;
  className?: string;
}

/**
 * DESIGN.md `action-bar.priority`, highest first. An undeclared registered slot
 * is treated as below `usage-bar`.
 */
export const ACTION_BAR_PRIORITY = {
  stop: 100,
  "isolation-pill": 90,
  "permission-mode": 70,
  "provider/config": 60,
  "diff-summary": 50,
  mode: 40,
  "queue-count": 30,
  "usage-bar": 20,
} as const;

export const UNDECLARED_SLOT_PRIORITY = 10;

/** Width budget per entry id, used by the fold pass and by its tests. */
export const ACTION_BAR_ITEM_WIDTHS: Record<string, number> = {
  stop: 110,
  "isolation-pill": 120,
  "permission-mode": 90,
  "provider/config": 170,
  "diff-summary": 110,
  mode: 80,
  "queue-count": 90,
  "usage-bar": 70,
  default: 80,
};

export const OVERFLOW_TRIGGER_WIDTH = 28;

/** Inter-cluster gaps not attributable to any single entry. */
export const ACTION_BAR_CHROME_WIDTH = 24;

function itemWidth(id: string): number {
  return ACTION_BAR_ITEM_WIDTHS[id] ?? ACTION_BAR_ITEM_WIDTHS.default;
}

function useBarWidth(ref: React.RefObject<HTMLElement | null>): number {
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

interface BarEntry {
  id: string;
  priority: number;
  node: React.ReactNode;
}

export function ActionBar({
  cancellationState,
  graceDeadline = null,
  sessionId,
  providerName = "Claude Code",
  configSummary = "Sonnet · Medium",
  mode = "Supervised",
  worktreeBranch,
  noGit = false,
  queueCount = 0,
  usageText,
  onStop,
  className,
}: ActionBarProps) {
  const barRef = useRef<HTMLElement>(null);
  const availableWidth = useBarWidth(barRef);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const slots = getAllActionBarSlots();
  const permissionModeRegistered = slots.some(
    ([id]) => id === "permission-mode",
  );

  const entries: BarEntry[] = [
    {
      id: "provider/config",
      priority: ACTION_BAR_PRIORITY["provider/config"],
      node: (
        <Badge
          variant="outline"
          className="cursor-pointer hover:bg-(--tethys-surface-hover)"
        >
          <span className="text-(--tethys-text-primary)">{providerName}</span>
          {configSummary && (
            <span className="ml-1 text-(--tethys-text-muted)">
              ({configSummary})
            </span>
          )}
        </Badge>
      ),
    },
  ];

  // The `Mode:` badge is a replaceable default: a registration under
  // `permission-mode` supersedes it whichever module imports first.
  if (!permissionModeRegistered) {
    entries.push({
      id: "permission-mode",
      priority: ACTION_BAR_PRIORITY["permission-mode"],
      node: (
        <Badge
          variant="outline"
          className="cursor-pointer hover:bg-(--tethys-surface-hover)"
        >
          <span>Mode: {mode}</span>
        </Badge>
      ),
    });
  }

  for (const [id, entry] of slots) {
    const Slot = entry.component;
    entries.push({
      id,
      priority: entry.priority ?? UNDECLARED_SLOT_PRIORITY,
      node: <Slot key={id} sessionId={sessionId} />,
    });
  }

  entries.push({
    id: "isolation-pill",
    priority: ACTION_BAR_PRIORITY["isolation-pill"],
    node: worktreeBranch ? (
      <Badge variant="outline">
        <span>{worktreeBranch}</span>
      </Badge>
    ) : noGit ? (
      <Badge variant="muted">no git</Badge>
    ) : null,
  });

  if (usageText) {
    entries.push({
      id: "usage-bar",
      priority: ACTION_BAR_PRIORITY["usage-bar"],
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

  if (queueCount > 0) {
    entries.push({
      id: "queue-count",
      priority: ACTION_BAR_PRIORITY["queue-count"],
      node: <Badge variant="warning">{queueCount} queued</Badge>,
    });
  }

  // Fold pass: lowest priority first, but Stop and the isolation pill never fold.
  const foldable = entries
    .filter(
      (entry) =>
        entry.id !== "isolation-pill" &&
        entry.id !== "stop" &&
        entry.node !== null,
    )
    .sort((a, b) => a.priority - b.priority);

  const totalWidth = foldable.reduce(
    (sum, entry) => sum + itemWidth(entry.id),
    0,
  );
  // Non-foldable chrome (Stop, the isolation pill, inter-cluster gaps) still
  // consumes the bar, so the budget must reserve it or the bar under-folds.
  const isolationWidth = entries.some(
    (entry) => entry.id === "isolation-pill" && entry.node !== null,
  )
    ? itemWidth("isolation-pill")
    : 0;
  const chromeWidth =
    itemWidth("stop") + isolationWidth + ACTION_BAR_CHROME_WIDTH;

  const folded = new Set<string>();
  let remaining = totalWidth;
  for (const entry of foldable) {
    const triggerCost = folded.size > 0 ? OVERFLOW_TRIGGER_WIDTH : 0;
    if (remaining + chromeWidth + triggerCost <= availableWidth) break;
    folded.add(entry.id);
    remaining -= itemWidth(entry.id);
  }

  const rendered = entries.filter(
    (entry) => entry.node !== null && !folded.has(entry.id),
  );
  const foldedEntries = entries.filter((entry) => folded.has(entry.id));
  const queueFolded = folded.has("queue-count") && queueCount > 0;

  return (
    <footer
      ref={barRef}
      className={`flex h-(--layout-shell-actionbar) w-full shrink-0 items-center justify-between border-t border-(--tethys-hairline-structural) bg-(--tethys-surface-rail) px-lg select-none ${className ?? ""}`}
    >
      {/* Left cluster: context, config and registered pills */}
      <div className="flex items-center gap-sm">
        {rendered
          .filter(
            (entry) => entry.id !== "usage-bar" && entry.id !== "queue-count",
          )
          .map((entry) => (
            <span key={entry.id}>{entry.node}</span>
          ))}
      </div>

      {/* Right cluster: telemetry, queue, overflow, Stop */}
      <div className="flex items-center gap-md">
        {rendered
          .filter(
            (entry) => entry.id === "usage-bar" || entry.id === "queue-count",
          )
          .map((entry) => (
            <span key={entry.id}>{entry.node}</span>
          ))}

        {folded.size > 0 && (
          <div className="relative">
            <button
              type="button"
              aria-label={`More: ${foldedEntries.map((entry) => entry.id).join(", ")}`}
              aria-haspopup="dialog"
              aria-expanded={overflowOpen}
              onClick={() => setOverflowOpen((open) => !open)}
              className="relative flex h-5 w-5 items-center justify-center rounded-xs border border-(--tethys-hairline) bg-(--tethys-surface-hover) font-mono text-mono-micro text-(--tethys-text-secondary) focus-ring"
            >
              •••
              {queueFolded && (
                <span
                  data-testid="overflow-queue-dot"
                  className="absolute -right-0.5 -top-0.5 inline-block size-1.5 rounded-full bg-(--tethys-status-warning)"
                />
              )}
            </button>
            <OverflowPopover
              open={overflowOpen}
              onClose={() => setOverflowOpen(false)}
              anchorRef={barRef}
            >
              {foldedEntries.map((entry) => (
                <div key={entry.id} className="px-2 py-1">
                  {entry.node}
                </div>
              ))}
            </OverflowPopover>
          </div>
        )}

        <StopControl
          phase={cancellationState}
          graceDeadline={graceDeadline}
          onStop={onStop}
        />
      </div>
    </footer>
  );
}

function OverflowPopover({
  open,
  onClose,
  anchorRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      className="right-0 bottom-full mb-2 min-w-40"
    >
      {children}
    </Popover>
  );
}
