//! `session-item-row` (DESIGN.md; spec §2). The full-density drawer row. Where
//! a workspace has no git (or no restore) the diff badge and rollback are
//! hidden and the row shows `no git · no revert` instead.

import {
  type CatalogSession,
  isAwaiting,
  sessionStatusKey,
} from "@tethys/state";
import { Button, cn, StatusDot } from "@tethys/ui";
import { ProviderGlyph } from "./session-item-chip";

export interface SessionItemRowProps {
  session: CatalogSession;
  hasGit?: boolean;
  hasRestore?: boolean;
  onOpen?: () => void;
}

export function SessionItemRow({
  session,
  hasGit = true,
  hasRestore = true,
  onOpen,
}: SessionItemRowProps) {
  const stateKey = sessionStatusKey(session.status);
  const showDiff = hasGit && hasRestore && session.diffStat !== null;

  return (
    <div
      data-testid="session-item-row"
      className={cn(
        "flex flex-col gap-sm rounded-md border bg-(--tethys-surface-nested) p-md",
        isAwaiting(session.status)
          ? "border-warning-soft bg-(--tethys-status-warning-soft)"
          : "border-(--tethys-hairline)",
      )}
    >
      <div className="flex items-center justify-between gap-sm">
        <div className="flex min-w-0 items-center gap-sm">
          <ProviderGlyph providerId={session.providerId} />
          <span className="truncate font-mono text-mono-code text-(--tethys-text-primary)">
            {session.branchName}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-label-sm text-(--tethys-text-muted)">
          <StatusDot status={stateKey} />
          <span>{session.providerId}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-body-sm text-(--tethys-text-secondary)">
        <span>Turn T{session.turnCount}</span>
        {showDiff ? (
          <span className="font-mono text-mono-code">
            <span className="text-diff-added">+{session.diffStat?.added}</span>{" "}
            <span className="text-diff-removed">
              −{session.diffStat?.removed}
            </span>
          </span>
        ) : (
          <span className="font-mono text-mono-micro text-(--tethys-text-muted)">
            no git · no revert
          </span>
        )}
      </div>

      <div className="flex justify-end gap-sm">
        {showDiff && (
          <Button size="sm" variant="secondary" disabled>
            Rollback
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={onOpen}>
          Open Session →
        </Button>
      </div>
    </div>
  );
}
