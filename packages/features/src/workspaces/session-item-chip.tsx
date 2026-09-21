//! `session-item-chip` (DESIGN.md; spec §2). The card-footer chip: provider
//! glyph, branch (ellipsis + full-name tooltip), diff stat and turn count,
//! sized `minWidth` 96 / `maxWidth` 240, with the M1.6c inline `status-dot` as
//! the `statusMarker` on the glyph corner. Field drop and slot priority come
//! from `@tethys/state`, so the component and its test share one rule.

import {
  type CatalogSession,
  CHIP_MAX_WIDTH,
  CHIP_MIN_WIDTH,
  chipFields,
  sessionStatusKey,
} from "@tethys/state";
import { cn, StatusDot, Tooltip } from "@tethys/ui";

export function ProviderGlyph({ providerId }: { providerId: string }) {
  const initials =
    providerId
      .split(/[-_\s]+/)
      .map((part) => part[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      data-testid="provider-glyph"
      className="flex h-4 w-4 items-center justify-center rounded-xs bg-(--tethys-surface-hover) font-mono text-mono-micro text-(--tethys-text-secondary)"
    >
      {initials}
    </span>
  );
}

export interface SessionItemChipProps {
  session: CatalogSession;
  /** Rendered chip width in px; drives `fieldDropOrder`. */
  width?: number;
  onOpen?: () => void;
}

export function SessionItemChip({
  session,
  width = 200,
  onOpen,
}: SessionItemChipProps) {
  const stateKey = sessionStatusKey(session.status);
  const awaiting = stateKey === "awaiting_approval";
  const fields = chipFields(width);

  return (
    <Tooltip content={session.branchName}>
      <button
        type="button"
        data-testid="session-item-chip"
        data-status={stateKey}
        onClick={onOpen}
        style={{ minWidth: CHIP_MIN_WIDTH, maxWidth: CHIP_MAX_WIDTH }}
        className={cn(
          "focus-ring relative flex min-w-0 items-center gap-1.5 rounded-sm border px-2 py-1 text-left transition-colors hover:border-(--tethys-hairline-strong)",
          awaiting
            ? "border-warning-soft bg-(--tethys-status-warning-soft) text-(--tethys-text-primary)"
            : "border-(--tethys-hairline) bg-(--tethys-surface-panel) text-(--tethys-text-primary)",
        )}
      >
        <span className="relative shrink-0">
          <ProviderGlyph providerId={session.providerId} />
          <StatusDot
            status={stateKey}
            inline
            data-testid="status-marker"
            className="absolute -right-0.5 -bottom-0.5"
          />
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-mono-micro">
          {session.branchName}
        </span>
        {fields.diffStat && session.diffStat && (
          <span
            data-testid="chip-diff"
            className="shrink-0 font-mono text-mono-micro"
          >
            <span className="text-diff-added">+{session.diffStat.added}</span>{" "}
            <span className="text-diff-removed">
              −{session.diffStat.removed}
            </span>
          </span>
        )}
        {fields.turn && (
          <span
            data-testid="chip-turn"
            className="shrink-0 rounded-xs bg-(--tethys-surface-hover) px-1 font-mono text-mono-micro text-(--tethys-text-muted)"
          >
            T{session.turnCount}
          </span>
        )}
      </button>
    </Tooltip>
  );
}
