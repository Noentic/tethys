import type { SessionEntry, ToolCallEntry } from "@tethys/state";
import { ActivityOrb, cn, TruncatedText } from "@tethys/ui";
import { toolHeadline } from "../tool-view";
import { formatElapsed, useNow } from "../use-now";

function formatQuiet(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * What the working indicator reads from the transcript: when the running turn
 * started (its prompt), when anything last happened, and the call in flight.
 */
export function workingState(entries: SessionEntry[]): {
  startedAt: number;
  lastEventAt: number;
  inFlightTitle: string | null;
} {
  let startedAt = 0;
  let lastEventAt = 0;
  let inFlight: ToolCallEntry | null = null;
  for (const entry of entries) {
    lastEventAt = Math.max(lastEventAt, entry.timestamp);
    if (
      entry.kind === "turn_message" &&
      "role" in entry &&
      entry.role === "User"
    ) {
      startedAt = entry.timestamp;
      inFlight = null;
    } else if (entry.kind === "tool_call") {
      const call = entry as ToolCallEntry;
      if (call.status === "Executing" || call.status === "Pending") {
        inFlight = call;
      }
    }
  }
  const headline = inFlight ? toolHeadline(inFlight) : null;
  return {
    startedAt,
    lastEventAt,
    inFlightTitle: headline
      ? [headline.verb, headline.subject].filter(Boolean).join(" ")
      : null,
  };
}

/**
 * The one "the agent is alive" signal in the stage (DESIGN.md
 * `working-indicator`): the activity orb, `Working · 14s`, and what is in
 * flight. Elapsed time is text that ticks once a second, so nothing depends
 * on the orb's motion.
 */
export function WorkingIndicator({
  startedAt,
  lastEventAt,
  inFlightTitle,
  now: fixedNow,
  quietThresholdMs = 30_000,
  className,
}: {
  startedAt: number;
  lastEventAt: number;
  inFlightTitle?: string | null;
  /** A fixed clock for tests; live, the indicator reads the time itself. */
  now?: number;
  quietThresholdMs?: number;
  className?: string;
}) {
  const liveNow = useNow(fixedNow === undefined);
  const now = fixedNow ?? liveNow;
  const idleMs = Math.max(0, now - lastEventAt);
  const quiet = idleMs >= quietThresholdMs;

  return (
    <div
      data-testid="working-indicator"
      role="status"
      className={cn(
        "flex min-h-5 min-w-0 items-center gap-sm font-mono text-mono-micro text-(--tethys-text-muted)",
        className,
      )}
    >
      <ActivityOrb size={14} className="text-(--tethys-text-secondary)" />
      <span className="shrink-0">
        Working · {formatElapsed(now - startedAt)}
      </span>
      {inFlightTitle && <TruncatedText text={`· ${inFlightTitle}`} />}
      {quiet && (
        <span className="shrink-0">
          · No activity for {formatQuiet(idleMs)}
        </span>
      )}
    </div>
  );
}
