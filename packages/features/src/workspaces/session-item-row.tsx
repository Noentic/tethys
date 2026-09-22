//! `session-item-row` (DESIGN.md; pen `Session Item Row` SPn6u): the 36px
//! drawer row — status dot, provider glyph, branch, turn tag, diff stat.
//! Values the wire did not report are omitted (P9), so the turn tag and diff
//! appear only once a session carries them.

import { type CatalogSession, sessionStatusKey } from "@tethys/state";
import { StatusDot } from "@tethys/ui";
import { useRef } from "react";
import { ProviderGlyph } from "./session-item-chip";

export interface SessionItemRowProps {
  session: CatalogSession;
  onOpen?: () => void;
  busy?: boolean;
  onArchive?: () => void;
  onDeleteLocal?: () => void;
  onDeleteProvider?: () => void;
}

/** The wire's placeholder id while a session's provider is unknown. */
export function isKnownProvider(providerId: string): boolean {
  return providerId !== "" && providerId !== "unknown";
}

export function SessionItemRow({
  session,
  onOpen,
  busy = false,
  onArchive,
  onDeleteLocal,
  onDeleteProvider,
}: SessionItemRowProps) {
  const stateKey = sessionStatusKey(session.status);
  const actionsRef = useRef<HTMLDetailsElement>(null);
  const hasActions = onArchive || onDeleteLocal || onDeleteProvider;
  const runAction = (action?: () => void) => {
    actionsRef.current?.removeAttribute("open");
    action?.();
  };

  return (
    <div className="group relative flex h-9 w-full items-center rounded-sm hover:bg-(--tethys-surface-hover)">
      <button
        type="button"
        data-testid="session-item-row"
        data-status={stateKey}
        onClick={onOpen}
        aria-label={`${session.branchName} (${stateKey.replace("_", " ")})`}
        className="focus-ring flex h-full min-w-0 flex-1 items-center gap-2 rounded-sm px-3 text-left"
      >
        <StatusDot status={stateKey} />
        {isKnownProvider(session.providerId) && (
          <ProviderGlyph providerId={session.providerId} />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-mono-micro text-(--tethys-text-secondary)">
          {session.branchName}
        </span>
        {session.turnCount > 0 && (
          <span className="shrink-0 font-mono text-mono-micro text-(--tethys-text-muted)">
            T{session.turnCount}
          </span>
        )}
        {session.diffStat && (
          <span className="flex shrink-0 items-center gap-0.5 font-mono text-mono-micro">
            <span className="text-diff-added">+{session.diffStat.added}</span>
            <span className="text-diff-removed">
              −{session.diffStat.removed}
            </span>
          </span>
        )}
      </button>
      {hasActions && (
        <details ref={actionsRef} className="relative mr-1 shrink-0">
          <summary
            aria-label={`Actions for ${session.branchName}`}
            aria-haspopup="menu"
            className="focus-ring flex size-6 cursor-pointer list-none items-center justify-center rounded-sm text-(--tethys-text-muted) hover:bg-(--tethys-surface-active) hover:text-(--tethys-text-primary) group-hover:opacity-100 opacity-0 focus:opacity-100 [&::-webkit-details-marker]:hidden"
          >
            <svg
              viewBox="0 0 16 16"
              className="size-4"
              aria-hidden="true"
              fill="currentColor"
            >
              <circle cx="3" cy="8" r="1" />
              <circle cx="8" cy="8" r="1" />
              <circle cx="13" cy="8" r="1" />
            </svg>
          </summary>
          <div
            role="menu"
            aria-label={`Session actions for ${session.branchName}`}
            className="edge-lit absolute right-0 top-full z-(--tethys-z-popover) mt-1 flex min-w-40 flex-col rounded-md border border-(--tethys-hairline-strong) bg-(--tethys-surface-overlay) p-1"
          >
            {onArchive && (
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => runAction(onArchive)}
                className="focus-ring rounded-sm px-2 py-1.5 text-left text-body-sm text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover) disabled:opacity-40"
              >
                Archive
              </button>
            )}
            {onDeleteLocal && (
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => runAction(onDeleteLocal)}
                className="focus-ring rounded-sm px-2 py-1.5 text-left text-body-sm text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover) disabled:opacity-40"
              >
                Delete locally…
              </button>
            )}
            {onDeleteProvider && (
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => runAction(onDeleteProvider)}
                className="focus-ring rounded-sm px-2 py-1.5 text-left text-body-sm text-(--tethys-status-danger) hover:bg-(--tethys-status-danger-soft) disabled:opacity-40"
              >
                Delete from provider…
              </button>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
