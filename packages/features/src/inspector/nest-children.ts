//! Pure parent/child indexing for subagent cards (M1.7 U16).

import type { SessionEntry, ToolCallEntry } from "@tethys/state";

export interface ChildIndex {
  /** Entry ids that are a child of some tool call. */
  childIds: Set<string>;
  /** Children grouped by their parent tool-call id. */
  childrenByParent: Map<string, SessionEntry[]>;
  /** Children whose parent is not present in the transcript (replay gap). */
  orphanIds: Set<string>;
}

function parentOf(entry: SessionEntry): string | null {
  return entry.kind === "tool_call"
    ? ((entry as ToolCallEntry).parentToolCallId ?? null)
    : null;
}

export function indexChildren(entries: SessionEntry[]): ChildIndex {
  const ids = new Set(entries.map((entry) => entry.id));
  const childIds = new Set<string>();
  const orphanIds = new Set<string>();
  const childrenByParent = new Map<string, SessionEntry[]>();

  for (const entry of entries) {
    const parent = parentOf(entry);
    if (!parent) {
      continue;
    }
    childIds.add(entry.id);
    if (!ids.has(parent)) {
      orphanIds.add(entry.id);
    }
    const list = childrenByParent.get(parent) ?? [];
    list.push(entry);
    childrenByParent.set(parent, list);
  }

  return { childIds, childrenByParent, orphanIds };
}

/**
 * The entries a subagent card renders: its direct children, plus a
 * grandchild rendered flat (depth 2) inside the same card — never a third
 * indent.
 */
export function cardChildren(
  parentId: string,
  index: ChildIndex,
): Array<{ entry: SessionEntry; depth: number }> {
  const direct = index.childrenByParent.get(parentId) ?? [];
  const result: Array<{ entry: SessionEntry; depth: number }> = [];
  for (const child of direct) {
    result.push({ entry: child, depth: 1 });
    for (const grandchild of index.childrenByParent.get(child.id) ?? []) {
      result.push({ entry: grandchild, depth: 2 });
    }
  }
  return result;
}
