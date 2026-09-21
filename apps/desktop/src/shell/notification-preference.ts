//! Persisted notification preference. One switch, as the pen's General page
//! has one `System notifications` row: desktop alerts for approvals and agent
//! completion. The plugin decides permission; this only gates sending.

import { useSyncExternalStore } from "react";

export interface NotificationPreference {
  /** Desktop alerts for approvals and turn completion. */
  enabled: boolean;
}

const STORAGE_KEY = "tethys.notification-preference";
const listeners = new Set<() => void>();

function read(): NotificationPreference {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return { enabled: true };
    const parsed = JSON.parse(raw) as Partial<NotificationPreference>;
    return { enabled: parsed.enabled !== false };
  } catch {
    return { enabled: true };
  }
}

let current: NotificationPreference = read();

function write(next: NotificationPreference): void {
  current = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (tests): the in-memory value holds.
  }
  for (const listener of listeners) listener();
}

export function notificationsEnabled(): boolean {
  return current.enabled;
}

export function setNotificationsEnabled(enabled: boolean): void {
  write({ enabled });
}

export function useNotificationPreference(): NotificationPreference {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current,
  );
}
