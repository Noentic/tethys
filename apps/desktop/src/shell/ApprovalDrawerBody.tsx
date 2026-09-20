import { Badge, Button } from "@tethys/ui";

export interface ApprovalDrawerBodyProps {
  sessions: Array<{ sessionId: string; title: string; status: string }>;
  onOpenSession: (sessionId: string) => void;
  className?: string;
}

/**
 * The placeholder approval-drawer body, kept as a replaceable default: M1.8
 * registers the real inbox through `registerApprovalDrawerBody` and this
 * renders only while nothing is registered. Behaviour is unchanged.
 */
export function ApprovalDrawerBody({
  sessions,
  onOpenSession,
}: ApprovalDrawerBodyProps) {
  const awaiting = sessions.filter(
    (session) => session.status === "awaiting_approval",
  );

  return (
    <div className="flex flex-col gap-md">
      {awaiting.length === 0 ? (
        <div className="py-2xl text-center text-body-sm text-(--tethys-text-muted)">
          No pending approval requests.
        </div>
      ) : (
        awaiting.map((sess) => (
          <div
            key={sess.sessionId}
            className="flex flex-col gap-sm rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-nested) p-md"
          >
            <div className="flex items-center justify-between gap-sm">
              <span className="truncate text-body-sm text-(--tethys-text-primary)">
                {sess.title}
              </span>
              <Badge variant="warning" size="sm">
                Action required
              </Badge>
            </div>
            <p className="text-body-sm text-(--tethys-text-secondary)">
              Session is awaiting tool execution permission.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="self-end"
              onClick={() => onOpenSession(sess.sessionId)}
            >
              Open session
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
