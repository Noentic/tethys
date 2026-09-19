import { Plus } from "@nebutra/icons";
import {
  type SessionState,
  selectWorkspaceProviderSessionGroups,
} from "@tethys/state";
import {
  Button,
  IconButton,
  nextRovingIndex,
  SessionGroupHeader,
  SessionListRow,
  StatusDot,
} from "@tethys/ui";
import { type KeyboardEvent, useState } from "react";

export interface SessionsColumnProps {
  sessions: SessionState[];
  activeSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession?: () => void;
  collapsed?: boolean;
}

export function SessionsColumn({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  collapsed = false,
}: SessionsColumnProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const groups = selectWorkspaceProviderSessionGroups(sessions);
  const workspaceLabel =
    sessions.find((s) => s.sessionId === activeSessionId)?.workspaceId ??
    groups[0]?.workspaceId;
  const firstSessionId = groups[0]?.providers[0]?.sessions[0]?.sessionId;

  // Roving focus across the flattened visible session list (DESIGN.md §A11y).
  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const rows = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="button"]'),
    );
    if (rows.length === 0) return;
    const focused = rows.indexOf(document.activeElement as HTMLElement);
    const anchor =
      focused >= 0
        ? focused
        : rows.findIndex((row) => row.getAttribute("aria-pressed") === "true");
    const next = nextRovingIndex(event.key, anchor, rows.length);
    if (next === null) return;
    event.preventDefault();
    rows[next]?.focus();
  };

  if (collapsed) {
    // Icon strip mode (<800px)
    return (
      <nav
        aria-label="Sessions"
        className="flex h-full w-rail shrink-0 flex-col items-center gap-sm overflow-y-auto border-r border-(--tethys-hairline-structural) bg-(--tethys-surface-panel) py-3 select-none"
      >
        <IconButton
          size="compact"
          label="New Session"
          onClick={onNewSession}
          className="mb-2"
        >
          <Plus className="h-4 w-4" />
        </IconButton>
        {sessions.map((sess) => (
          <button
            key={sess.sessionId}
            type="button"
            title={`${sess.title} (${sess.status})`}
            onClick={() => onSelectSession(sess.sessionId)}
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-(--tethys-surface-hover)"
          >
            <StatusDot status={sess.status} />
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Sessions Column"
      onKeyDown={handleListKeyDown}
      className="flex h-full w-full flex-col border-r border-(--tethys-hairline-structural) bg-(--tethys-surface-panel) select-none"
    >
      {(workspaceLabel || onNewSession) && (
        <div className="flex flex-col gap-md border-b border-(--tethys-hairline) p-md">
          {workspaceLabel && (
            <div className="flex items-center gap-2.5">
              <div
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-active) text-label-md text-(--tethys-text-primary) uppercase"
              >
                {workspaceLabel.charAt(0)}
              </div>
              <span className="min-w-0 flex-1 truncate text-body-sm text-(--tethys-text-primary)">
                {workspaceLabel}
              </span>
            </div>
          )}

          {onNewSession && (
            <Button
              variant="secondary"
              onClick={onNewSession}
              className="w-full"
            >
              <Plus className="size-3.5" />
              <span>New session</span>
            </Button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-1">
        {groups.length === 0 ? (
          <div className="p-lg text-center text-body-sm text-(--tethys-text-muted)">
            No active sessions
          </div>
        ) : (
          groups.map((wsGroup) => {
            const wsKey = `ws-${wsGroup.workspaceId}`;
            const isWsCollapsed = !!collapsedGroups[wsKey];
            const totalWsSessions = wsGroup.providers.reduce(
              (acc, p) => acc + p.sessions.length,
              0,
            );

            return (
              <div key={wsGroup.workspaceId} className="mb-2">
                <SessionGroupHeader
                  level={1}
                  title={wsGroup.workspaceId}
                  count={totalWsSessions}
                  collapsed={isWsCollapsed}
                  onToggle={() => toggleGroup(wsKey)}
                />

                {!isWsCollapsed && (
                  <div className="flex flex-col gap-0.5">
                    {wsGroup.providers.map((pGroup) => {
                      const pKey = `${wsKey}-p-${pGroup.providerId}`;
                      const isPCollapsed = !!collapsedGroups[pKey];

                      return (
                        <div key={pGroup.providerId} className="mb-1">
                          <SessionGroupHeader
                            level={2}
                            title={pGroup.providerId}
                            count={pGroup.sessions.length}
                            collapsed={isPCollapsed}
                            onToggle={() => toggleGroup(pKey)}
                          />

                          {!isPCollapsed && (
                            <div className="flex flex-col gap-0.5 pl-2">
                              {pGroup.sessions.map((sess) => (
                                <SessionListRow
                                  key={sess.sessionId}
                                  sessionId={sess.sessionId}
                                  title={sess.title}
                                  status={sess.status}
                                  branchName={sess.branchName}
                                  turnCount={sess.turnCount}
                                  dirty={false}
                                  selected={sess.sessionId === activeSessionId}
                                  tabIndex={
                                    sess.sessionId === activeSessionId ||
                                    (activeSessionId === undefined &&
                                      sess.sessionId === firstSessionId)
                                      ? 0
                                      : -1
                                  }
                                  onSelect={() =>
                                    onSelectSession(sess.sessionId)
                                  }
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </nav>
  );
}
