import { type CancellationState, selectIsStopDestructive } from "@tethys/state";
import { Badge, Button } from "@tethys/ui";

export interface ActionBarProps {
  cancellationState: CancellationState;
  providerName?: string;
  configSummary?: string;
  mode?: string;
  worktreeBranch?: string;
  queueCount?: number;
  usageText?: string;
  onStop?: () => void;
  className?: string;
}

export function ActionBar({
  cancellationState,
  providerName = "Claude Code",
  configSummary = "Sonnet · Medium",
  mode = "Supervised",
  worktreeBranch,
  queueCount = 0,
  usageText,
  onStop,
  className,
}: ActionBarProps) {
  const isDestructive = selectIsStopDestructive(cancellationState);
  const isPending = cancellationState === "cancel_requested";

  return (
    <footer
      className={`flex h-14 w-full items-center justify-between border-t border-[var(--tethys-hairline)] bg-[var(--tethys-surface-elevated)] px-4 select-none ${className ?? ""}`}
    >
      {/* Left cluster: Context & Configuration pills */}
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="text-xs cursor-pointer hover:bg-[var(--tethys-surface-hover)]"
        >
          <span className="font-semibold">{providerName}</span>
          {configSummary && (
            <span className="text-[var(--tethys-text-muted)] ml-1">
              ({configSummary})
            </span>
          )}
        </Badge>

        <Badge
          variant="outline"
          className="text-xs cursor-pointer hover:bg-[var(--tethys-surface-hover)]"
        >
          <span>Mode: {mode}</span>
        </Badge>

        {worktreeBranch && (
          <Badge variant="outline" className="text-xs">
            <span className="font-mono">{worktreeBranch}</span>
          </Badge>
        )}
      </div>

      {/* Right cluster: telemetry/usage + queue + Stop button */}
      <div className="flex items-center gap-3">
        {usageText && (
          <span
            title={`Token usage: ${usageText}`}
            className="font-mono text-xs text-[var(--tethys-text-muted)]"
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
          className={
            isDestructive
              ? "bg-[rgba(239,68,68,0.15)] border-[var(--tethys-status-danger)] text-[var(--tethys-status-danger)] font-semibold"
              : undefined
          }
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
