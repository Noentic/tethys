//! Pure tool-run grouping (M1.7 U15). A run is a maximal sequence of
//! consecutive tool-call entries; any other entry ends it.

import type { SessionEntry, ToolCallEntry } from "@tethys/state";

type RunCategory =
  | "read"
  | "execute"
  | "edit"
  | "search"
  | "fetch"
  | "think"
  | "switch_mode"
  | "other";

const CATEGORY_OF: Record<string, RunCategory> = {
  read: "read",
  execute: "execute",
  edit: "edit",
  delete: "edit",
  move: "edit",
  search: "search",
  fetch: "fetch",
  think: "think",
  switch_mode: "switch_mode",
};

const CATEGORY_ORDER: RunCategory[] = [
  "read",
  "execute",
  "edit",
  "search",
  "fetch",
  "think",
  "switch_mode",
  "other",
];

function categoryOf(kind: string | null | undefined): RunCategory {
  return kind ? (CATEGORY_OF[kind] ?? "other") : "other";
}

function phrase(category: RunCategory, count: number): string {
  const plural = count === 1 ? "" : "s";
  switch (category) {
    case "read":
      return `Read ${count} file${plural}`;
    case "execute":
      return `ran ${count} command${plural}`;
    case "edit":
      return `${count} edit${plural}`;
    case "search":
      return `${count} search${count === 1 ? "" : "es"}`;
    case "fetch":
      return `${count} fetch${count === 1 ? "" : "es"}`;
    case "think":
      return `${count} thought${plural}`;
    case "switch_mode":
      return `${count} mode switch${count === 1 ? "" : "es"}`;
    default:
      return `${count} tool call${plural}`;
  }
}

export interface ToolRunCount {
  category: RunCategory;
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
  hasAwaiting: boolean;
  isLive: boolean;
  inFlightTitle: string | null;
}

export function isFileMutation(entry: SessionEntry): boolean {
  if (entry.kind === "file_write") {
    return true;
  }
  if (entry.kind === "tool_call") {
    const tool = entry as ToolCallEntry;
    return (
      tool.toolKind === "edit" ||
      tool.toolKind === "delete" ||
      tool.toolKind === "move"
    );
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
  const byCategory = new Map<RunCategory, number>();
  for (const member of members) {
    const category = categoryOf(member.toolKind);
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
  }
  const counts: ToolRunCount[] = CATEGORY_ORDER.filter((category) =>
    byCategory.has(category),
  ).map((category) => {
    const count = byCategory.get(category) ?? 0;
    return { category, count, phrase: phrase(category, count) };
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
    hasAwaiting: members.some((member) => member.status === "Pending"),
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
