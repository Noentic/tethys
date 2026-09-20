//! Streaming-transcript announcements (M1.7 U17, DESIGN.md Accessibility).
//!
//! The stage announces nothing per chunk. A polite region speaks only turn
//! completion and a new permission or elicitation; an assertive region speaks
//! `error` and `connection-lost` notices.

import type {
  SessionEntry,
  TurnMessageEntry,
  TurnNoticeEntry,
} from "@tethys/state";
import { cn } from "@tethys/ui";

export interface Announcement {
  message: string;
  assertive: boolean;
}

function isTurnComplete(entry: SessionEntry): boolean {
  return (
    entry.kind === "turn_message" &&
    (entry as TurnMessageEntry).streaming !== true
  );
}

/**
 * The single most recent thing worth announcing, or null while a turn is still
 * streaming. A stream of chunks therefore produces no announcement.
 */
export function latestAnnouncement(
  entries: SessionEntry[],
): Announcement | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.kind === "turn_notice") {
      const notice = entry as TurnNoticeEntry;
      const assertive =
        notice.noticeKind === "error" ||
        notice.noticeKind === "connection_lost";
      return { message: notice.message, assertive };
    }
    if (entry.kind === "permission_request") {
      return {
        message: `Permission requested: ${(entry as { request: { title: string } }).request.title}`,
        assertive: false,
      };
    }
    if (entry.kind === "elicitation") {
      return {
        message: `Input requested: ${(entry as { request: { title: string } }).request.title}`,
        assertive: false,
      };
    }
    if (isTurnComplete(entry)) {
      return { message: "Turn complete", assertive: false };
    }
    if (entry.kind === "turn_message") {
      // Still streaming: nothing to announce yet.
      return null;
    }
  }
  return null;
}

/** The polite/assertive live region pair. */
export function TranscriptAnnouncer({
  announcement,
  className,
}: {
  announcement: Announcement | null;
  className?: string;
}) {
  return (
    <div
      data-testid="transcript-announcer"
      aria-live={announcement?.assertive ? "assertive" : "polite"}
      aria-atomic="true"
      className={cn("sr-only", className)}
    >
      {announcement?.message ?? ""}
    </div>
  );
}
