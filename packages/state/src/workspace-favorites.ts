//! Locally pinned workspaces (the card's star). A favorite is a UI preference,
//! not workspace data: it sorts a pinned workspace first and nothing else.

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "tethys.workspace-favorites";
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

let current: string[] = read();

function write(next: string[]): void {
  current = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (tests): the in-memory value holds.
  }
  for (const listener of listeners) listener();
}

export function workspaceFavorites(): string[] {
  return current;
}

export function isFavoriteWorkspace(workspaceId: string): boolean {
  return current.includes(workspaceId);
}

export function toggleWorkspaceFavorite(workspaceId: string): void {
  write(
    current.includes(workspaceId)
      ? current.filter((id) => id !== workspaceId)
      : [...current, workspaceId],
  );
}

/** Favorites first, each group in catalog order. */
export function favoritesFirst<T extends { id: string }>(
  workspaces: T[],
  favorites: string[] = current,
): T[] {
  if (favorites.length === 0) return workspaces;
  return [...workspaces].sort((a, b) => {
    const pinned = favorites.includes(b.id) ? 1 : 0;
    const other = favorites.includes(a.id) ? 1 : 0;
    return pinned - other;
  });
}

export function useWorkspaceFavorites(): string[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current,
  );
}
