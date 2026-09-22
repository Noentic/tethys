//! `workspace-peek-drawer` (DESIGN.md; pen `Workspace Peek Drawer` r8PCup).
//! Modeless (the catalog stays interactive) but focus-trapping via the shared
//! `Drawer`. Two tabs: Sessions (grouped by Provider) and Approvals. Worktree A
//! owns the approval card; this renders its inbox entries and never owns the
//! approval logic.

import {
  Cross,
  FolderClosed,
  GitBranch,
  LogoGithub,
  LogoGitlab,
  Plus,
} from "@nebutra/icons";
import {
  type CatalogPeekTab,
  type CatalogSession,
  type CatalogWorkspace,
  selectInboxItems,
  sessionsRegistryStore,
} from "@tethys/state";
import { Button, Drawer, StatusDot, UnderlineTabs } from "@tethys/ui";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { isKnownProvider, SessionItemRow } from "./session-item-row";

/** One pending request as the drawer shows it. Derived from the session store. */
export interface ApprovalEntry {
  id: string;
  workspaceId: string;
  providerId: string;
  summary: string;
  kind: "permission" | "elicitation";
}

export interface WorkspacePeekDrawerProps {
  workspace: CatalogWorkspace | null;
  open: boolean;
  initialTab?: CatalogPeekTab;
  /** Test override; the live session stores are the default source. */
  approvals?: ApprovalEntry[];
  onClose: () => void;
  onOpenThread?: (sessionId: string) => void;
  onNewThread?: () => void;
}

/**
 * The real pending requests for one workspace, read from the same
 * `selectInboxItems` projection the approval drawer and the inline cards use, so
 * the peek drawer can never show an approval the app does not have.
 */
function useWorkspaceApprovals(workspaceId: string | undefined) {
  const registry = useSyncExternalStore(
    (onStoreChange) => {
      const subscription = sessionsRegistryStore.subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    () => sessionsRegistryStore.state,
  );
  return useMemo(() => {
    const sessions = Object.values(registry.sessions).filter(
      (session) => session.workspaceId === workspaceId,
    );
    return selectInboxItems(sessions).map((item) => ({
      id: `${item.sessionId}-${item.reqId}`,
      workspaceId: workspaceId ?? "",
      providerId: registry.sessions[item.sessionId]?.providerId ?? "",
      summary: item.description ?? item.title,
      kind: item.kind,
    }));
  }, [registry, workspaceId]);
}

function groupByProvider(
  sessions: CatalogSession[],
): Array<[string, CatalogSession[]]> {
  const groups = new Map<string, CatalogSession[]>();
  for (const session of sessions) {
    const key = isKnownProvider(session.providerId)
      ? session.providerId
      : "Sessions";
    const list = groups.get(key) ?? [];
    list.push(session);
    groups.set(key, list);
  }
  return [...groups.entries()];
}

function sourceIcon(workspace: CatalogWorkspace) {
  const vcs = workspace.capabilities.vcs;
  if (vcs.kind === "none") return FolderClosed;
  if (vcs.kind === "git-remote" && vcs.host === "github") return LogoGithub;
  if (vcs.kind === "git-remote" && vcs.host === "gitlab") return LogoGitlab;
  return GitBranch;
}

export function WorkspacePeekDrawer({
  workspace,
  open,
  initialTab = "sessions",
  approvals,
  onClose,
  onOpenThread,
  onNewThread,
}: WorkspacePeekDrawerProps) {
  const [tab, setTab] = useState<CatalogPeekTab>(initialTab);
  const liveApprovals = useWorkspaceApprovals(workspace?.id);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the peeked workspace changes
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab, workspace?.id]);

  if (!workspace) return null;

  const entries = (approvals ?? liveApprovals).filter(
    (entry) => entry.workspaceId === workspace.id,
  );
  const SourceIcon = sourceIcon(workspace);
  const capReached =
    workspace.capabilities.max_concurrent_sessions === 1 &&
    workspace.sessions.length >= 1;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      bare
      label={workspace.name}
      side="right"
      width="w-(--layout-drawer-peek)"
      showScrim={false}
    >
      <div className="flex h-full flex-col">
        {/* Header: name, source glyph, close. */}
        <div className="flex w-full items-center gap-lg p-lg">
          <span className="min-w-0 flex-1 truncate text-heading-md text-(--tethys-text-primary)">
            {workspace.name}
          </span>
          <span
            title={workspace.path}
            className="flex h-[18px] shrink-0 items-center gap-0.5 rounded-xs bg-(--tethys-surface-hover) px-1.5 text-(--tethys-text-muted)"
          >
            <SourceIcon className="size-3" aria-hidden="true" />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close workspace details"
            className="focus-ring flex size-4 shrink-0 items-center justify-center text-(--tethys-text-secondary) hover:text-(--tethys-text-primary)"
          >
            <Cross className="size-4" aria-hidden="true" />
          </button>
        </div>

        <UnderlineTabs<CatalogPeekTab>
          label="Workspace details"
          value={tab}
          onChange={setTab}
          className="border-b border-(--tethys-hairline) px-lg"
          tabs={[
            { value: "sessions", label: "Sessions" },
            { value: "approvals", label: "Approvals" },
          ]}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {tab === "sessions" ? (
            workspace.sessions.length === 0 ? (
              <p className="py-2xl text-center text-body-sm text-(--tethys-text-muted)">
                No active sessions running in this workspace.
              </p>
            ) : (
              groupByProvider(workspace.sessions).map(
                ([provider, sessions]) => (
                  <div key={provider} className="flex flex-col">
                    <div className="flex h-7 items-center gap-1.5 px-3 text-label-md text-(--tethys-text-muted)">
                      <span aria-hidden="true">▾</span>
                      <span>{provider}</span>
                    </div>
                    {sessions.map((session) => (
                      <SessionItemRow
                        key={session.id}
                        session={session}
                        onOpen={() => onOpenThread?.(session.id)}
                      />
                    ))}
                  </div>
                ),
              )
            )
          ) : entries.length === 0 ? (
            <p className="py-2xl text-center text-body-sm text-(--tethys-text-muted)">
              No pending approvals for this workspace.
            </p>
          ) : (
            <div className="flex flex-col gap-md p-1.5">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  data-testid="drawer-approval-entry"
                  className="flex flex-col gap-sm rounded-md border border-(--tethys-hairline) border-l-2 border-l-(--tethys-status-warning) bg-(--tethys-status-warning-soft) p-lg"
                >
                  <div className="flex items-center gap-sm text-label-md text-(--tethys-status-warning)">
                    <StatusDot status="awaiting_approval" inline />
                    <span>
                      {entry.kind === "elicitation"
                        ? "Question"
                        : "Permission Request"}
                      {entry.providerId ? ` · ${entry.providerId}` : ""}
                    </span>
                  </div>
                  <p className="text-body-sm text-(--tethys-text-secondary)">
                    {entry.summary}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: the one place a new thread starts from a card. */}
        <div className="border-t border-(--tethys-hairline) p-lg">
          <Button
            variant="secondary"
            disabled={capReached}
            onClick={onNewThread}
            title={
              capReached
                ? "This folder allows one session at a time"
                : undefined
            }
            className="gap-1.5"
          >
            <Plus className="size-4" />
            <span>New thread</span>
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
