//! `workspace-peek-drawer` (DESIGN.md; spec §2). Modeless (the catalog stays
//! interactive) but focus-trapping via the shared `Drawer`. Two DESIGN tabs:
//! Sessions (grouped by Provider) and Approvals. Worktree A owns the approval
//! card and responder; this renders its inbox entries through a fixture-backed
//! hook (overview D12) and never owns the approval logic.

import type {
  CatalogPeekTab,
  CatalogSession,
  CatalogWorkspace,
} from "@tethys/state";
import { Button, Drawer, StatusDot, UnderlineTabs } from "@tethys/ui";
import { useEffect, useState } from "react";
import { SessionItemRow } from "./session-item-row";

export interface ApprovalEntry {
  id: string;
  workspaceId: string;
  providerId: string;
  summary: string;
}

export const approvalEntryFixtures: ApprovalEntry[] = [
  {
    id: "ap-1",
    workspaceId: "tethys",
    providerId: "codex",
    summary: "Edit apps/desktop/src/routes/workspaces.tsx",
  },
];

export interface WorkspacePeekDrawerProps {
  workspace: CatalogWorkspace | null;
  open: boolean;
  initialTab?: CatalogPeekTab;
  approvals?: ApprovalEntry[];
  onClose: () => void;
  onOpenThread?: (sessionId: string) => void;
  onNewThread?: () => void;
}

function groupByProvider(
  sessions: CatalogSession[],
): Array<[string, CatalogSession[]]> {
  const groups = new Map<string, CatalogSession[]>();
  for (const session of sessions) {
    const list = groups.get(session.providerId) ?? [];
    list.push(session);
    groups.set(session.providerId, list);
  }
  return [...groups.entries()];
}

export function WorkspacePeekDrawer({
  workspace,
  open,
  initialTab = "sessions",
  approvals = approvalEntryFixtures,
  onClose,
  onOpenThread,
  onNewThread,
}: WorkspacePeekDrawerProps) {
  const [tab, setTab] = useState<CatalogPeekTab>(initialTab);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the peeked workspace changes
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab, workspace?.id]);

  if (!workspace) return null;

  const entries = approvals.filter(
    (entry) => entry.workspaceId === workspace.id,
  );
  const hasGit = workspace.capabilities.vcs.kind !== "none";
  const hasRestore = workspace.capabilities.restore;
  const capReached =
    workspace.capabilities.max_concurrent_sessions === 1 &&
    workspace.sessions.length >= 1;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={workspace.name}
      side="right"
      width="w-(--layout-drawer-peek)"
      showScrim={false}
    >
      <div className="flex h-full flex-col gap-lg">
        <div className="flex flex-col gap-1.5 border-b border-(--tethys-hairline) pb-lg">
          <span className="text-heading-md text-(--tethys-text-primary)">
            {workspace.name}
          </span>
          <span className="font-mono text-mono-code text-(--tethys-text-secondary)">
            {workspace.path}
          </span>
        </div>

        <UnderlineTabs<CatalogPeekTab>
          label="Workspace details"
          value={tab}
          onChange={setTab}
          className="border-b border-(--tethys-hairline)"
          tabs={[
            {
              value: "sessions",
              label: `Sessions (${workspace.sessions.length})`,
            },
            {
              value: "approvals",
              label: "Approvals",
              adornment:
                entries.length > 0 ? (
                  <StatusDot status="awaiting_approval" inline />
                ) : undefined,
            },
          ]}
        />

        <div className="flex-1 overflow-y-auto">
          {tab === "sessions" ? (
            workspace.sessions.length === 0 ? (
              <p className="py-2xl text-center text-body-sm text-(--tethys-text-muted)">
                No active sessions running in this workspace.
              </p>
            ) : (
              <div className="flex flex-col gap-lg">
                {groupByProvider(workspace.sessions).map(
                  ([providerId, sessions]) => (
                    <div key={providerId} className="flex flex-col gap-sm">
                      <span className="text-label-sm uppercase text-(--tethys-text-muted)">
                        {providerId}
                      </span>
                      {sessions.map((session) => (
                        <SessionItemRow
                          key={session.id}
                          session={session}
                          hasGit={hasGit}
                          hasRestore={hasRestore}
                          onOpen={() => onOpenThread?.(session.id)}
                        />
                      ))}
                    </div>
                  ),
                )}
              </div>
            )
          ) : entries.length === 0 ? (
            <p className="py-2xl text-center text-body-sm text-(--tethys-text-muted)">
              No pending approvals for this workspace.
            </p>
          ) : (
            <div className="flex flex-col gap-md">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  data-testid="drawer-approval-entry"
                  className="flex flex-col gap-sm rounded-md border border-warning-soft bg-(--tethys-status-warning-soft) p-lg"
                >
                  <div className="flex items-center gap-sm text-label-md text-(--tethys-status-warning)">
                    <StatusDot status="awaiting_approval" inline />
                    <span>Permission Request · {entry.providerId}</span>
                  </div>
                  <p className="text-body-sm text-(--tethys-text-secondary)">
                    {entry.summary}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-(--tethys-hairline) pt-lg">
          <Button
            variant="secondary"
            disabled={capReached}
            onClick={onNewThread}
            title={
              capReached
                ? "This folder allows one session at a time"
                : undefined
            }
          >
            + New Thread
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
