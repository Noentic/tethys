//! `session-item-row` (DESIGN.md; pen `Session Item Row` SPn6u): the 36px
//! drawer row — status dot, provider glyph, branch, turn tag, diff stat.
//! Values the wire did not report are omitted (P9), so the turn tag and diff
//! appear only once a session carries them.

import { type CatalogSession, sessionStatusKey } from "@tethys/state";
import { StatusDot } from "@tethys/ui";
import { ProviderGlyph } from "./session-item-chip";

export interface SessionItemRowProps {
  session: CatalogSession;
  onOpen?: () => void;
}

/** The wire's placeholder id while a session's provider is unknown. */
export function isKnownProvider(providerId: string): boolean {
  return providerId !== "" && providerId !== "unknown";
}

export function SessionItemRow({ session, onOpen }: SessionItemRowProps) {
  const stateKey = sessionStatusKey(session.status);

  return (
    <button
      type="button"
      data-testid="session-item-row"
      data-status={stateKey}
      onClick={onOpen}
      aria-label={`${session.branchName} (${stateKey.replace("_", " ")})`}
      className="focus-ring flex h-9 w-full items-center gap-2 rounded-sm px-3 text-left transition-colors hover:bg-(--tethys-surface-hover)"
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
          <span className="text-diff-removed">−{session.diffStat.removed}</span>
        </span>
      )}
    </button>
  );
}
