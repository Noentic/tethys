//! `workspace-card` (DESIGN.md; pen `Workspace Card` sfBB1 / `No VCS` n2coW).
//!
//! Header: name, source glyph, favorite star, attention mark. Meta row: thread
//! count (or `Local folder · no VCS`). Body: up to three session rows (dot,
//! name, diff, turn) and a `+N more threads` row; a no-VCS folder swaps the
//! cluster for the `Initialize git` chip and the plain-mode hint.
//!
//! A value the backend did not report is omitted, never estimated (P9): the
//! per-session glyph, turn tag and diff render only when the wire carries them.

import {
  FolderClosed,
  GitBranch,
  LogoGithub,
  LogoGitlab,
  Star,
  StarFill,
  WarningFill,
} from "@nebutra/icons";
import type { CatalogSession, CatalogWorkspace } from "@tethys/state";
import {
  activeSessionCount,
  sessionStatusKey,
  toggleWorkspaceFavorite,
  useWorkspaceFavorites,
  workspaceHasGit,
  workspaceNeedsAttention,
} from "@tethys/state";
import { Card, cn } from "@tethys/ui";

export interface WorkspaceCardProps {
  workspace: CatalogWorkspace;
  selected?: boolean;
  onOpen?: () => void;
  onInitGit?: () => void;
  onOpenThread?: (sessionId: string) => void;
}

const MAX_THREAD_ROWS = 3;

function sourceGlyph(workspace: CatalogWorkspace) {
  const vcs = workspace.capabilities.vcs;
  if (vcs.kind === "none") return FolderClosed;
  if (vcs.kind === "git-remote" && vcs.host === "github") return LogoGithub;
  if (vcs.kind === "git-remote" && vcs.host === "gitlab") return LogoGitlab;
  return GitBranch;
}

function sessionLabel(session: CatalogSession): string {
  const key = sessionStatusKey(session.status);
  if (key === "awaiting_approval")
    return `${session.branchName} — awaiting your approval`;
  if (key === "running") return `${session.branchName} — running`;
  if (key === "error") return `${session.branchName} — failed`;
  return session.branchName;
}

function ThreadRow({
  session,
  onOpen,
}: {
  session: CatalogSession;
  onOpen?: () => void;
}) {
  const key = sessionStatusKey(session.status);
  const active = key === "running";
  const awaiting = key === "awaiting_approval";

  return (
    <button
      type="button"
      data-testid="workspace-card-thread"
      data-state={key}
      onClick={onOpen}
      aria-label={sessionLabel(session)}
      className="focus-ring flex h-6 w-full shrink-0 items-center justify-between gap-sm rounded-xs bg-(--tethys-surface-hover) px-2 text-left transition-colors hover:bg-(--tethys-surface-active)"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {(active || awaiting) && (
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              active
                ? "bg-(--tethys-accent-focus)"
                : "bg-(--tethys-status-warning)",
            )}
          />
        )}
        <span
          className={cn(
            "truncate font-mono text-mono-micro",
            active
              ? "text-(--tethys-text-primary)"
              : "text-(--tethys-text-secondary)",
          )}
        >
          {session.branchName}
        </span>
        {session.diffStat && (
          <span className="flex shrink-0 items-center gap-0.5 font-mono text-mono-micro">
            <span className="text-diff-added">+{session.diffStat.added}</span>
            <span className="text-diff-removed">
              −{session.diffStat.removed}
            </span>
          </span>
        )}
      </span>
      {session.turnCount > 0 && (
        <span className="shrink-0 font-mono text-mono-micro text-(--tethys-text-muted)">
          T{session.turnCount}
        </span>
      )}
    </button>
  );
}

export function WorkspaceCard({
  workspace,
  selected = false,
  onOpen,
  onInitGit,
  onOpenThread,
}: WorkspaceCardProps) {
  const favorites = useWorkspaceFavorites();
  const hasGit = workspaceHasGit(workspace);
  const attention = workspaceNeedsAttention(workspace);
  const favorite = favorites.includes(workspace.id);
  const SourceGlyph = sourceGlyph(workspace);
  const active = activeSessionCount(workspace);
  const rows = workspace.sessions.slice(0, MAX_THREAD_ROWS);
  const hidden = workspace.sessions.length - rows.length;

  return (
    <Card
      data-testid="workspace-card"
      data-selected={selected ? "true" : "false"}
      interactive
      className={cn(
        "group relative flex h-[210px] flex-col gap-2.5 p-lg",
        attention && "wash-warning",
      )}
    >
      {selected && (
        <span
          aria-hidden="true"
          className="absolute top-3 bottom-3 left-0 w-0.5 rounded-r-xs bg-(--tethys-accent-focus)"
        />
      )}

      <div className="flex w-full items-center gap-sm">
        <button
          type="button"
          aria-current={selected ? "true" : undefined}
          onClick={onOpen}
          className="focus-ring min-w-0 flex-1 truncate rounded-xs text-left text-heading-md text-(--tethys-text-primary) hover:underline"
        >
          {workspace.name}
        </button>
        <span
          data-testid="workspace-card-source"
          title={workspace.path}
          className="flex size-6 shrink-0 items-center justify-center rounded-xs bg-(--tethys-surface-hover) text-(--tethys-text-muted)"
        >
          <SourceGlyph className="size-3" aria-hidden="true" />
        </span>
        <button
          type="button"
          onClick={() => toggleWorkspaceFavorite(workspace.id)}
          aria-pressed={favorite}
          aria-label={
            favorite ? `Unpin ${workspace.name}` : `Pin ${workspace.name}`
          }
          className={cn(
            "focus-ring flex size-4 shrink-0 items-center justify-center rounded-xs",
            favorite
              ? "text-(--tethys-accent-focus)"
              : "text-(--tethys-text-muted) hover:text-(--tethys-text-secondary)",
          )}
        >
          {favorite ? (
            <StarFill className="size-4" aria-hidden="true" />
          ) : (
            <Star className="size-4" aria-hidden="true" />
          )}
        </button>
        {attention && (
          <WarningFill
            data-testid="workspace-card-attention"
            className="size-4 shrink-0 text-(--tethys-status-warning)"
            aria-label="A session is awaiting your approval"
          />
        )}
      </div>

      <div className="flex w-full items-center justify-between gap-sm font-mono text-mono-micro text-(--tethys-text-muted)">
        {hasGit ? (
          <span className="truncate">
            {workspace.sessions.length === 0
              ? "No threads yet"
              : `${workspace.sessions.length} thread${workspace.sessions.length === 1 ? "" : "s"}${
                  active > 0 ? ` (${active} active)` : ""
                }`}
          </span>
        ) : (
          <>
            <span className="truncate">Local folder · no VCS</span>
            <span className="shrink-0">
              {workspace.capabilities.max_concurrent_sessions === 1
                ? "1 session max"
                : ""}
            </span>
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        {hasGit ? (
          <>
            {rows.map((session) => (
              <ThreadRow
                key={session.id}
                session={session}
                onOpen={() => onOpenThread?.(session.id)}
              />
            ))}
            {hidden > 0 && (
              <button
                type="button"
                data-testid="workspace-card-more"
                onClick={onOpen}
                className="focus-ring mt-auto flex h-5 items-center px-0.5 text-left font-mono text-mono-micro text-(--tethys-accent-focus) hover:underline"
              >
                +{hidden} more thread{hidden === 1 ? "" : "s"} →
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              data-testid="git-init-upsell-chip"
              onClick={onInitGit}
              className="focus-ring h-5 w-fit rounded-xs bg-(--tethys-surface-hover) px-2 font-mono text-mono-micro text-(--tethys-text-secondary) hover:bg-(--tethys-surface-active) hover:text-(--tethys-text-primary)"
            >
              Initialize git →
            </button>
            {rows.map((session) => (
              <ThreadRow
                key={session.id}
                session={session}
                onOpen={() => onOpenThread?.(session.id)}
              />
            ))}
            <span className="mt-auto font-mono text-mono-micro text-(--tethys-text-muted)">
              Plain mode (no branches)
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
