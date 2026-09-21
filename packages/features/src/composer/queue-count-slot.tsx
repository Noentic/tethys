//! Queue-count composer context slot (M1.10 U5). Registers at DESIGN's `prompt-card.contextBarFold`
//! priority: it folds after the mode pill and before `usage-bar`.

import { registerComposerContextSlot } from "@tethys/ui";

export const QUEUE_COUNT_PRIORITY = 30;

export interface QueueCountData {
  count?: number;
}

/** Renders the staged-prompt count; hidden at zero per DESIGN. */
export function QueueCountSlot({
  data,
  className,
}: {
  data?: unknown;
  className?: string;
}) {
  const count = (data as QueueCountData | undefined)?.count ?? 0;
  if (count <= 0) return null;
  return (
    <span
      data-testid="queue-count"
      role="status"
      aria-label={`${count} queued prompts`}
      className={
        className ??
        "inline-flex h-5 items-center rounded-xs bg-(--tethys-surface-hover) px-2 font-mono text-mono-micro text-(--tethys-text-secondary)"
      }
    >
      {count} queued
    </span>
  );
}

export function registerQueueCountSlot(): void {
  registerComposerContextSlot(
    "queue-count",
    QueueCountSlot,
    QUEUE_COUNT_PRIORITY,
  );
}
