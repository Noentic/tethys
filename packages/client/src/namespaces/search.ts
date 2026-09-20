//! `search.*` client namespace. Wave 2 owner: shared/stable.

import type { SearchItem } from "@tethys/bindings";

import type { Call } from "../transport";

export function searchNamespace(call: Call) {
  return {
    files: (workspaceId: string, query: string, limit = 20) =>
      call<SearchItem[]>("search_files", { workspaceId, query, limit }),
  };
}
