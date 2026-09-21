//! `workspace-card` (DESIGN.md; spec §2). 220px, source badge, topology canvas,
//! session chips, status footer, `workspace-card-selected` accent bar, and the
//! `git-init-upsell-chip` on non-git folders.

import type { CatalogWorkspace } from "@tethys/state";
import {
  chipSlots,
  fitCountForWidth,
  isRunning,
  workspaceHasGit,
  workspaceNeedsAttention,
} from "@tethys/state";
import {
  Button,
  Card,
  cn,
  StatusDot,
  Tooltip,
  WorkspaceSourceBadge,
} from "@tethys/ui";
import { SessionItemChip } from "./session-item-chip";
import { SessionTopologyCanvas } from "./session-topology-canvas";

/** Card inner width at the 320px floor, used for the chip fit count. */
const CARD_INNER_WIDTH = 286;

export interface WorkspaceCardProps {
  workspace: CatalogWorkspace;
  selected?: boolean;
  onOpen?: () => void;
  onNewThread?: () => void;
  onInitGit?: () => void;
  onOpenThread?: (sessionId: string) => void;
}

function footerStatus(workspace: CatalogWorkspace): string {
  if (workspaceNeedsAttention(workspace)) return "awaiting_approval";
  if (workspace.sessions.some((session) => isRunning(session.status))) {
    return "running";
  }
  return "idle";
}

function statusSummary(workspace: CatalogWorkspace): string {
  if (!workspaceHasGit(workspace)) return "Single-session folder";
  if (workspace.sessions.length === 0) {
    return "Trunk · ready for new thread";
  }
  const count = workspace.sessions.length;
  return `${count} session${count === 1 ? "" : "s"}`;
}

export function WorkspaceCard({
  workspace,
  selected = false,
  onOpen,
  onNewThread,
  onInitGit,
  onOpenThread,
}: WorkspaceCardProps) {
  const hasGit = workspaceHasGit(workspace);
  const attention = workspaceNeedsAttention(workspace);
  const capReached =
    workspace.capabilities.max_concurrent_sessions === 1 &&
    workspace.sessions.length >= 1;
  const slots = chipSlots(
    workspace.sessions,
    fitCountForWidth(CARD_INNER_WIDTH),
  );

  return (
    <Card
      data-testid="workspace-card"
      data-selected={selected ? "true" : "false"}
      interactive
      className={cn(
        "group relative flex h-[220px] flex-col justify-between p-lg",
        selected &&
          "border-(--tethys-hairline-strong) before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded-r-xs before:bg-(--tethys-accent-focus)",
        attention && "wash-warning",
      )}
    >
      <div className="flex w-full items-center justify-between gap-sm">
        <div className="flex min-w-0 items-center gap-sm">
          <WorkspaceSourceBadge
            vcs={workspace.capabilities.vcs}
            className="shrink-0"
          />
          <button
            type="button"
            aria-current={selected ? "true" : undefined}
            onClick={onOpen}
            className="focus-ring truncate rounded-xs text-left text-heading-md text-(--tethys-text-primary) hover:underline"
          >
            {workspace.name}
          </button>
          {attention && (
            <StatusDot
              status="awaiting_approval"
              className="shrink-0"
              title="A session is awaiting your approval"
            />
          )}
        </div>
      </div>

      <span className="truncate font-mono text-mono-code text-(--tethys-text-muted)">
        {workspace.path}
      </span>

      <div className="dot-matrix my-sm flex min-h-0 flex-1 flex-col justify-center overflow-hidden rounded-md border border-(--tethys-hairline) bg-(--tethys-canvas) p-2">
        <SessionTopologyCanvas
          sessions={workspace.sessions}
          vcs={workspace.capabilities.vcs}
        />
      </div>

      <div className="flex min-h-5 items-center gap-1.5 overflow-hidden">
        {hasGit && workspace.sessions.length > 0 ? (
          <>
            {slots.visible.map((session) => (
              <SessionItemChip
                key={session.id}
                session={session}
                onOpen={() => onOpenThread?.(session.id)}
              />
            ))}
            {slots.overflow > 0 && (
              <button
                type="button"
                data-testid="chip-overflow"
                onClick={onOpen}
                className="focus-ring shrink-0 rounded-xs bg-(--tethys-surface-hover) px-1.5 py-1 font-mono text-mono-micro text-(--tethys-text-secondary)"
              >
                +{slots.overflow} more
              </button>
            )}
          </>
        ) : !hasGit ? (
          <button
            type="button"
            data-testid="git-init-upsell-chip"
            onClick={onInitGit}
            className="focus-ring rounded-xs border border-(--tethys-hairline) px-2 py-1 font-mono text-mono-micro text-(--tethys-accent-focus)"
          >
            Initialize git →
          </button>
        ) : null}
      </div>

      <div className="flex items-center justify-between text-label-md font-normal text-(--tethys-text-muted)">
        <div className="flex min-w-0 items-center gap-1.5">
          <StatusDot status={footerStatus(workspace)} />
          <span className="truncate">{statusSummary(workspace)}</span>
        </div>

        <Tooltip
          content={capReached ? "This folder allows one session at a time" : ""}
        >
          <Button
            size="sm"
            variant="ghost"
            disabled={capReached}
            onClick={onNewThread}
            className="h-6 px-2 text-(--tethys-accent-focus)"
          >
            <span>Thread</span>
          </Button>
        </Tooltip>
      </div>
    </Card>
  );
}
