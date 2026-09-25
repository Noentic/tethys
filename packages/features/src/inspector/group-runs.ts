//! Pure tool-run grouping (M1.7 U15). A run is a maximal sequence of
//! consecutive tool-call entries; any other entry ends it.

import type { ToolSurface } from "@tethys/bindings";
import type { SessionEntry, ToolCallEntry } from "@tethys/state";
import { surfaceCount, surfaceOf } from "./tool-view";

/** Surfaces in the order a run's summary names them. */
const SURFACE_ORDER: ToolSurface[] = [
  "read",
  "shell",
  "edit",
  "search",
  "web_fetch",
  "web_search",
  "mcp",
  "question",
  "todo",
  "think",
  "subagent",
  "other",
];

export interface ToolRunCount {
  surface: ToolSurface;
  phrase: string;
  count: number;
}

export interface ToolRun {
  id: string;
  members: ToolCallEntry[];
  counts: ToolRunCount[];
  summary: string;
  moreCount: number;
  hasFailure: boolean;
  isLive: boolean;
  inFlightTitle: string | null;
}

export function isFileMutation(entry: SessionEntry): boolean {
  if (entry.kind === "file_write") {
    return true;
  }
  if (entry.kind === "tool_call") {
    return surfaceOf(entry as ToolCallEntry) === "edit";
  }
  return false;
}

function isToolCall(entry: SessionEntry): entry is ToolCallEntry {
  return entry.kind === "tool_call";
}

export function summarizeRun(counts: ToolRunCount[]): string {
  const shown = counts.slice(0, 3).map((count) => count.phrase);
  const more = counts.length - shown.length;
  return more > 0 ? `${shown.join(" · ")} · +${more} more` : shown.join(" · ");
}

export function buildToolRun(members: ToolCallEntry[]): ToolRun {
  const bySurface = new Map<ToolSurface, number>();
  for (const member of members) {
    const surface = surfaceOf(member);
    bySurface.set(surface, (bySurface.get(surface) ?? 0) + 1);
  }
  const counts: ToolRunCount[] = SURFACE_ORDER.filter((surface) =>
    bySurface.has(surface),
  ).map((surface) => {
    const count = bySurface.get(surface) ?? 0;
    return {
      surface,
      count,
      phrase: surfaceCount(surface, count),
    };
  });
  const inFlight = members.find(
    (member) => member.status === "Executing" || member.status === "Pending",
  );
  return {
    id: `run-${members[0].id}`,
    members,
    counts,
    summary: summarizeRun(counts),
    moreCount: Math.max(0, counts.length - 3),
    hasFailure: members.some((member) => member.status === "Failed"),
    isLive: members.some(
      (member) => member.status === "Executing" || member.status === "Pending",
    ),
    inFlightTitle: inFlight?.title ?? null,
  };
}

export type TranscriptSegment =
  | { type: "run"; run: ToolRun }
  | { type: "entry"; entry: SessionEntry };

/**
 * Segments the transcript into single entries and grouped runs. A run of one
 * call stays an individual entry (there is nothing to summarize).
 */
export function groupToolRuns(entries: SessionEntry[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let buffer: ToolCallEntry[] = [];

  const flush = () => {
    if (buffer.length === 0) {
      return;
    }
    if (buffer.length === 1) {
      segments.push({ type: "entry", entry: buffer[0] });
    } else {
      segments.push({ type: "run", run: buildToolRun(buffer) });
    }
    buffer = [];
  };

  for (const entry of entries) {
    if (isToolCall(entry)) {
      buffer.push(entry);
    } else {
      flush();
      segments.push({ type: "entry", entry });
    }
  }
  flush();
  return segments;
}
