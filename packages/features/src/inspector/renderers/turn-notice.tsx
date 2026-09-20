import type { TurnNoticeEntry, TurnNoticeKind } from "@tethys/state";
import { Button, cn } from "@tethys/ui";
import { useId, useState } from "react";

interface NoticeSpec {
  role: "status" | "alert";
  icon: string;
  action?: "continue" | "retry" | "reconnect";
  actionLabel?: string;
}

const NOTICE: Record<TurnNoticeKind, NoticeSpec> = {
  refusal: { role: "status", icon: "⛔" },
  max_tokens: {
    role: "status",
    icon: "…",
    action: "continue",
    actionLabel: "Continue",
  },
  max_turn_requests: {
    role: "status",
    icon: "…",
    action: "continue",
    actionLabel: "Continue",
  },
  cancelled: { role: "status", icon: "◼" },
  error: { role: "alert", icon: "!", action: "retry", actionLabel: "Retry" },
  connection_lost: {
    role: "alert",
    icon: "⚡",
    action: "reconnect",
    actionLabel: "Reconnect",
  },
  compaction: { role: "status", icon: "⧉" },
};

/**
 * One inline stage entry for everything that ends or interrupts a turn other
 * than a permission or elicitation (DESIGN.md `turn-notice`). Colour is never
 * the only carrier: every kind has an icon and a sentence. One action at most.
 */
export function TurnNoticeRenderer({
  entry,
  className,
  onAction,
}: {
  entry: TurnNoticeEntry;
  className?: string;
  onAction?: (
    noticeKind: TurnNoticeKind,
    action: "continue" | "retry" | "reconnect",
  ) => void;
}) {
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const summaryId = useId();
  const spec = NOTICE[entry.noticeKind];

  if (entry.noticeKind === "compaction") {
    return (
      <div
        data-entry-kind="turn_notice"
        data-notice-kind="compaction"
        className={cn(
          "my-sm flex items-center gap-sm text-label-sm text-(--tethys-text-muted)",
          className,
        )}
      >
        <span className="h-px flex-1 bg-(--tethys-hairline)" />
        <button
          type="button"
          aria-expanded={summaryExpanded}
          aria-controls={summaryId}
          onClick={() => setSummaryExpanded((value) => !value)}
        >
          Context compacted
        </button>
        <span className="h-px flex-1 bg-(--tethys-hairline)" />
        {summaryExpanded && entry.summary && (
          <div id={summaryId} className="sr-only">
            {entry.summary}
          </div>
        )}
      </div>
    );
  }

  const action =
    entry.noticeKind === "error" && entry.retryable === false
      ? undefined
      : spec.action;

  return (
    <div
      data-entry-kind="turn_notice"
      data-notice-kind={entry.noticeKind}
      role={spec.role}
      className={cn(
        "rounded-md border border-(--tethys-hairline) border-l-2 p-md text-body-sm text-(--tethys-text-secondary)",
        entry.noticeKind === "error" || entry.noticeKind === "connection_lost"
          ? "border-l-(--tethys-status-danger)"
          : "border-l-(--tethys-status-warning)",
        className,
      )}
    >
      <div className="flex items-start gap-sm">
        <span aria-hidden="true">{spec.icon}</span>
        <span className="flex-1">{entry.message}</span>
        {action && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onAction?.(entry.noticeKind, action)}
          >
            {spec.actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
