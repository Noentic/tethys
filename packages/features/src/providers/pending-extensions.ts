//! Per-Provider pending vendor-extension queue (M1.7 U13).
//!
//! A `ProviderExtension` whose `(provider_id, method)` has a registered surface
//! enqueues here; an unregistered method falls through to generic rendering and
//! is never enqueued. The queue is a pure projection the popover and the pill
//! count both read.

import type { ProviderExtension } from "@tethys/bindings";
import { getProviderSurface } from "@tethys/ui";
import { useSyncExternalStore } from "react";

const pending = new Map<string, ProviderExtension[]>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** True when a request's method has a registered surface. */
export function hasProviderSurface(
  providerId: string,
  method: string,
): boolean {
  return getProviderSurface(providerId, method) !== undefined;
}

/**
 * Enqueues an extension request, unless its method has no registered surface —
 * those fall through to the generic unknown-event rendering.
 */
export function enqueueProviderExtension(
  extension: ProviderExtension,
): boolean {
  if (!hasProviderSurface(extension.provider_id, extension.method)) {
    return false;
  }
  const list = pending.get(extension.provider_id) ?? [];
  pending.set(extension.provider_id, [...list, extension]);
  notify();
  return true;
}

export function getPendingExtensions(providerId: string): ProviderExtension[] {
  return pending.get(providerId) ?? [];
}

/** Removes one request from a Provider's queue (popover dismissed/handled). */
export function dequeueProviderExtension(
  providerId: string,
  extension: ProviderExtension,
): void {
  const list = pending.get(providerId) ?? [];
  pending.set(
    providerId,
    list.filter((candidate) => candidate !== extension),
  );
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

export function usePendingExtensions(providerId: string): ProviderExtension[] {
  return (
    useSyncExternalStore(
      subscribe,
      () => pending.get(providerId),
      () => pending.get(providerId),
    ) ?? []
  );
}
