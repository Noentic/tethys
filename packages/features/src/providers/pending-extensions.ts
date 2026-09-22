//! Thread-scoped queue for registered ACP Provider extension surfaces.

import type { ProviderExtension } from "@tethys/bindings";
import { getProviderSurface } from "@tethys/ui";
import { useSyncExternalStore } from "react";

interface ThreadQueue {
  items: ProviderExtension[];
  dismissed: Set<ProviderExtension>;
  revision: number;
}

const pending = new Map<string, ThreadQueue>();
const listeners = new Set<() => void>();

function queue(threadId: string): ThreadQueue {
  let current = pending.get(threadId);
  if (!current) {
    current = { items: [], dismissed: new Set(), revision: 0 };
    pending.set(threadId, current);
  }
  return current;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function hasProviderSurface(
  providerId: string,
  method: string,
): boolean {
  return getProviderSurface(providerId, method) !== undefined;
}

/** Unregistered notifications still appear in the transcript's generic row. */
export function enqueueProviderExtension(
  threadId: string,
  extension: ProviderExtension,
): boolean {
  if (!hasProviderSurface(extension.provider_id, extension.method))
    return false;
  const current = queue(threadId);
  if (
    extension.request_id &&
    current.items.some((item) => item.request_id === extension.request_id)
  ) {
    return true;
  }
  current.items = [...current.items, extension];
  current.revision += 1;
  notify();
  return true;
}

export function getPendingExtensions(threadId: string): ProviderExtension[] {
  return queue(threadId).items;
}

export function isProviderExtensionDismissed(
  threadId: string,
  extension: ProviderExtension,
): boolean {
  return queue(threadId).dismissed.has(extension);
}

/** Hides a request while preserving its live ACP responder for later. */
export function dismissProviderExtension(
  threadId: string,
  extension: ProviderExtension,
): void {
  const current = queue(threadId);
  current.dismissed.add(extension);
  current.revision += 1;
  notify();
}

export function reopenProviderExtensions(threadId: string): void {
  const current = queue(threadId);
  current.dismissed.clear();
  current.revision += 1;
  notify();
}

export function dequeueProviderExtension(
  threadId: string,
  requestId: string,
): void {
  const current = queue(threadId);
  current.items = current.items.filter((item) => item.request_id !== requestId);
  current.dismissed = new Set(
    [...current.dismissed].filter((item) => item.request_id !== requestId),
  );
  current.revision += 1;
  notify();
}

export function clearPendingExtensionsForTesting(): void {
  pending.clear();
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingExtensions(threadId: string): ProviderExtension[] {
  useSyncExternalStore(
    subscribe,
    () => queue(threadId).revision,
    () => queue(threadId).revision,
  );
  return queue(threadId).items;
}
