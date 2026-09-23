import type {
  ElicitationEntry,
  PermissionRequestEntry,
  SessionEntry,
} from "@tethys/state";
import { useEffect, useMemo, useState } from "react";
import { ElicitationCard } from "./elicitation-card";
import { PermissionRequestCard } from "./permission-request-card";

type RequestEntry = PermissionRequestEntry | ElicitationEntry;

function isPendingRequest(entry: SessionEntry): entry is RequestEntry {
  if (entry.kind === "permission_request") {
    return (
      "request" in entry &&
      !(entry as PermissionRequestEntry).request.resolution
    );
  }
  if (entry.kind === "elicitation") {
    return "resolution" in entry && !(entry as ElicitationEntry).resolution;
  }
  return false;
}

export function RequestDock({ entries }: { entries: SessionEntry[] }) {
  const requests = useMemo(() => entries.filter(isPendingRequest), [entries]);
  const [index, setIndex] = useState(0);
  const currentIndex = Math.min(index, Math.max(0, requests.length - 1));
  const current = requests[currentIndex];

  useEffect(() => {
    if (index !== currentIndex) setIndex(currentIndex);
  }, [currentIndex, index]);

  if (!current) return null;

  return (
    <section
      data-testid="request-dock"
      aria-label="Requests waiting for you"
      className="flex flex-col gap-sm"
    >
      <header className="flex items-center gap-sm text-label-sm text-(--tethys-status-warning)">
        <span>Waiting for you ↓</span>
        {requests.length > 1 && (
          <div className="ml-auto flex items-center gap-xs">
            <button
              type="button"
              aria-label="Previous request"
              disabled={currentIndex === 0}
              onClick={() => setIndex(currentIndex - 1)}
              className="focus-ring rounded px-1 disabled:opacity-40"
            >
              ‹
            </button>
            <span className="font-mono text-mono-micro text-(--tethys-text-muted)">
              {currentIndex + 1} of {requests.length}
            </span>
            <button
              type="button"
              aria-label="Next request"
              disabled={currentIndex === requests.length - 1}
              onClick={() => setIndex(currentIndex + 1)}
              className="focus-ring rounded px-1 disabled:opacity-40"
            >
              ›
            </button>
          </div>
        )}
      </header>
      {current.kind === "permission_request" ? (
        <PermissionRequestCard entry={current} />
      ) : (
        <ElicitationCard entry={current} />
      )}
    </section>
  );
}
