import { Plus } from "@nebutra/icons";
import {
  type SessionState,
  selectWorkspaceProviderSessionGroups,
} from "@tethys/state";
import {
  IconButton,
  SessionGroupHeader,
  SessionListRow,
  StatusDot,
} from "@tethys/ui";
import { useState } from "react";

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

  if (collapsed) {
    // Icon strip mode (<800px)
    return (
      <nav
        aria-label="Sessions"
        className="flex h-full w-12 flex-col items-center gap-2 border-r border-(--tethys-hairline) bg-(--tethys-surface-panel) py-3 select-none shrink-0 overflow-y-auto"
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
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-(--tethys-surface-hover) outline-none"
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
      className="flex h-full w-[280px] flex-col border-r border-(--tethys-hairline) bg-(--tethys-surface-panel) select-none shrink-0"
    >
      {/* Workspace Header & New Session Button (Matching Image 6) */}
      <div className="flex flex-col gap-2.5 border-b border-(--tethys-hairline) p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-(--tethys-surface-active) border border-(--tethys-hairline) text-xs font-bold text-(--tethys-text-primary)">
            T
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-semibold text-(--tethys-text-primary) truncate">
              tethys
            </span>
            <span className="text-[10px] font-mono text-(--tethys-text-muted) truncate">
              ~/Code/tethys
            </span>
          </div>
        </div>

        {onNewSession && (
          <button
            type="button"
            onClick={onNewSession}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-(--tethys-hairline) bg-(--tethys-surface-elevated) hover:bg-(--tethys-surface-hover) text-xs font-medium text-(--tethys-text-primary) transition-colors"
          >
            <Plus className="size-3.5" />
            <span>New session</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        {groups.length === 0 ? (
          <div className="p-4 text-center text-xs text-(--tethys-text-muted)">
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
