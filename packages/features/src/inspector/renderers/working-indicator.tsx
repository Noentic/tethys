import { cn, StatusDot } from "@tethys/ui";

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * The one "the agent is alive" signal in the stage (DESIGN.md
 * `working-indicator`). Elapsed time is text, so nothing depends on motion.
 */
export function WorkingIndicator({
  startedAt,
  lastEventAt,
  inFlightTitle,
  now = Date.now(),
  quietThresholdMs = 30_000,
  className,
}: {
  startedAt: number;
  lastEventAt: number;
  inFlightTitle?: string | null;
  now?: number;
  quietThresholdMs?: number;
  className?: string;
}) {
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const idleMs = Math.max(0, now - lastEventAt);
  const quiet = idleMs >= quietThresholdMs;

  return (
    <div
      data-testid="working-indicator"
      role="status"
      className={cn(
        "flex items-center gap-sm text-mono-micro text-(--tethys-text-muted)",
        className,
      )}
    >
      <StatusDot status="running" inline />
      <span>Working · {elapsedSeconds}s</span>
      {inFlightTitle && <span>· {inFlightTitle}</span>}
      {quiet && <span>· No activity for {formatDuration(idleMs)}</span>}
    </div>
  );
}
