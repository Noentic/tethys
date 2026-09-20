import { type CancellationState, selectIsStopDestructive } from "@tethys/state";
import { Badge, Button, getAllActionBarSlots } from "@tethys/ui";

export interface ActionBarProps {
  cancellationState: CancellationState;
  sessionId?: string;
  providerName?: string;
  configSummary?: string;
  mode?: string;
  worktreeBranch?: string;
  noGit?: boolean;
  queueCount?: number;
  usageText?: string;
  onStop?: () => void;
  className?: string;
}

export function ActionBar({
  cancellationState,
  sessionId,
  providerName = "Claude Code",
  configSummary = "Sonnet · Medium",
  mode = "Supervised",
  worktreeBranch,
  noGit = false,
  queueCount = 0,
  usageText,
  onStop,
  className,
}: ActionBarProps) {
  const isDestructive = selectIsStopDestructive(cancellationState);
  const isPending = cancellationState === "cancel_requested";
  const slots = getAllActionBarSlots();

  return (
    <footer
      className={`flex h-(--layout-shell-actionbar) w-full shrink-0 items-center justify-between border-t border-(--tethys-hairline-structural) bg-(--tethys-surface-rail) px-lg select-none ${className ?? ""}`}
    >
      {/* Left cluster: Context & Configuration pills */}
      <div className="flex items-center gap-sm">
        <Badge
          variant="outline"
          className="cursor-pointer hover:bg-(--tethys-surface-hover)"
        >
          <span className="text-(--tethys-text-primary)">{providerName}</span>
          {configSummary && (
            <span className="ml-1 text-(--tethys-text-muted)">
              ({configSummary})
            </span>
          )}
        </Badge>

        <Badge
          variant="outline"
          className="cursor-pointer hover:bg-(--tethys-surface-hover)"
        >
          <span>Mode: {mode}</span>
        </Badge>

        {/* Wave-2 chunks contribute pills through registerActionBarSlot. */}
        {slots.map(([id, Slot]) => (
          <Slot key={id} sessionId={sessionId} />
        ))}

        {worktreeBranch ? (
          <Badge variant="outline">
            <span>{worktreeBranch}</span>
          </Badge>
        ) : (
          noGit && <Badge variant="muted">no git</Badge>
        )}
      </div>

      {/* Right cluster: telemetry/usage + queue + Stop button */}
      <div className="flex items-center gap-md">
        {usageText && (
          <span
            title={`Token usage: ${usageText}`}
            className="font-mono text-mono-code text-(--tethys-text-muted)"
          >
            {usageText}
          </span>
        )}

        {queueCount > 0 && <Badge variant="warning">{queueCount} queued</Badge>}

        <Button
          variant={isDestructive ? "destructive" : "secondary"}
          size="sm"
          onClick={onStop}
          loading={isPending}
          className={isDestructive ? "tint-danger" : undefined}
        >
          {cancellationState === "terminating"
            ? "Terminating (SIGKILL)"
            : cancellationState === "grace_elapsed"
              ? "Force Kill"
              : isPending
                ? "Cancelling..."
                : "Stop"}
        </Button>
      </div>
    </footer>
  );
}
