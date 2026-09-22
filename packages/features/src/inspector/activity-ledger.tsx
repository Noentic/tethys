import type { SessionEntry, TurnMessageEntry } from "@tethys/state";
import { cn, StatusDot, ToggleSwitch } from "@tethys/ui";
import { useState } from "react";
import { countActivity, type LedgerCounts } from "./ledger-counts";
import { useSessionState } from "./use-session-state";

/** Entries after the last user message — the current turn's range. */
function lastTurnEntries(entries: SessionEntry[]): SessionEntry[] {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (
      entry.kind === "turn_message" &&
      (entry as TurnMessageEntry).role === "User"
    ) {
      return entries.slice(index);
    }
  }
  return entries;
}

function LedgerSection({
  counts,
  className,
}: {
  counts: LedgerCounts;
  className?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (counts.total === 0) {
    return (
      <p
        data-testid="activity-ledger-empty"
        className={cn("text-body-sm text-(--tethys-text-muted)", className)}
      >
        No tool calls yet
      </p>
    );
  }

  return (
    <ul
      data-testid="activity-ledger"
      className={cn("flex flex-col", className)}
    >
      {counts.rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            aria-expanded={expanded === row.id}
            onClick={() =>
              setExpanded((current) => (current === row.id ? null : row.id))
            }
            className="flex w-full items-center gap-sm py-1 text-left text-body-sm text-(--tethys-text-secondary)"
          >
            <StatusDot status="idle" inline />
            <span className="flex-1">{row.label}</span>
            <span className="font-mono text-mono-micro text-(--tethys-text-muted)">
              {row.count}
            </span>
          </button>
          {expanded === row.id && (
            <ul className="mb-1 flex flex-col gap-0.5 pl-md">
              {row.items.map((item) => (
                <li key={`${row.id}-${item.entryId}`}>
                  <a
                    href={`#${item.entryId}`}
                    className="truncate font-mono text-mono-micro text-(--tethys-text-muted) underline"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The Inspector's second index over the same history (DESIGN.md
 * `activity-ledger`), mounted through `registerInspectorSlot`, which hands it
 * only a `sessionId`: it reads the session's entries from that store. Explicit
 * `data` (the entries) overrides the store, for callers that already hold them.
 */
export function ActivityLedger({
  sessionId,
  data,
  className,
}: {
  sessionId?: string;
  data?: unknown;
  className?: string;
}) {
  const [thisTurn, setThisTurn] = useState(false);
  const state = useSessionState(sessionId ?? "");
  const entries: SessionEntry[] = Array.isArray(data)
    ? (data as SessionEntry[])
    : state.entries;
  const thisTurnEntries = lastTurnEntries(entries);
  const counts = countActivity(thisTurn ? thisTurnEntries : entries);

  return (
    <section
      aria-label="Activity"
      className={cn(
        "rounded-sm border border-(--tethys-hairline) bg-(--tethys-surface-panel) px-3 py-2",
        className,
      )}
    >
      <header className="mb-sm flex items-center justify-between">
        <span className="text-label-sm text-(--tethys-text-muted)">
          Activity
        </span>
        <span className="flex items-center gap-1 text-label-sm text-(--tethys-text-muted)">
          This turn
          <ToggleSwitch
            checked={thisTurn}
            onCheckedChange={setThisTurn}
            label="This turn"
          />
        </span>
      </header>
      <LedgerSection counts={counts} />
    </section>
  );
}
