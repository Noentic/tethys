//! Pure activity-ledger counts (M1.7 U18). The ledger is the second index over
//! the same history: grouped by kind, derived only from tool-call entries.

import type { SessionEntry, ToolCallEntry } from "@tethys/state";

export interface LedgerItem {
  label: string;
  entryId: string;
}

export interface LedgerRow {
  id: string;
  label: string;
  count: number;
  items: LedgerItem[];
}

export interface LedgerCounts {
  rows: LedgerRow[];
  total: number;
}

const EDIT_KINDS = new Set(["edit", "delete", "move"]);

interface RowBuilder {
  id: string;
  label: string;
  items: LedgerItem[];
}

function itemLabel(entry: ToolCallEntry): string {
  const location = entry.locations[0];
  return location ? location.path : entry.title;
}

/**
 * Counts tool-call entries by kind and origin. Rows with zero calls are
 * omitted; `total` is the number of tool calls so an empty session can render
 * `No tool calls yet`.
 */
export function countActivity(entries: SessionEntry[]): LedgerCounts {
  const toolCalls = entries.filter(
    (entry): entry is ToolCallEntry => entry.kind === "tool_call",
  );

  const rows: RowBuilder[] = [
    { id: "read", label: "Files read", items: [] },
    { id: "execute", label: "Commands run", items: [] },
    { id: "edit", label: "Edits", items: [] },
    { id: "search", label: "Searches", items: [] },
    { id: "fetch", label: "Fetches", items: [] },
    { id: "mcp", label: "MCP calls", items: [] },
    { id: "skill", label: "Skills used", items: [] },
    { id: "subagent", label: "Subagents", items: [] },
  ];
  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const entry of toolCalls) {
    const origin = entry.origin;
    if (origin?.kind === "mcp") {
      byId.get("mcp")?.items.push({
        label: `${origin.server} · ${entry.title}`,
        entryId: entry.id,
      });
      continue;
    }
    if (origin?.kind === "skill") {
      byId.get("skill")?.items.push({
        label: origin.name,
        entryId: entry.id,
      });
      continue;
    }
    if (origin?.kind === "subagent") {
      byId.get("subagent")?.items.push({
        label: entry.title,
        entryId: entry.id,
      });
      continue;
    }
    const kind = entry.toolKind ?? "other";
    if (kind === "read") {
      byId.get("read")?.items.push({
        label: itemLabel(entry),
        entryId: entry.id,
      });
    } else if (kind === "execute") {
      byId.get("execute")?.items.push({
        label: entry.title,
        entryId: entry.id,
      });
    } else if (EDIT_KINDS.has(kind)) {
      byId.get("edit")?.items.push({
        label: itemLabel(entry),
        entryId: entry.id,
      });
    } else if (kind === "search") {
      byId.get("search")?.items.push({
        label: entry.title,
        entryId: entry.id,
      });
    } else if (kind === "fetch") {
      byId.get("fetch")?.items.push({
        label: entry.title,
        entryId: entry.id,
      });
    }
  }

  const materialized = rows
    .filter((row) => row.items.length > 0)
    .map<LedgerRow>((row) => ({
      id: row.id,
      label: row.label,
      count: row.items.length,
      items: row.items,
    }));

  return { rows: materialized, total: toolCalls.length };
}
