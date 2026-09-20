//! `events.*` client namespace. Wave 2 owner: A (M1.7/M1.8).
//!
//! TODO(A): type `subscribe` against tethys-api and design the `Channel`
//! transport it returns; the wrapper is still `call<void>()`.

import type { Call } from "../transport";

export function eventsNamespace(call: Call) {
  return {
    subscribe: () => call<void>("events_subscribe"),
    unsubscribe: () => call<void>("events_unsubscribe"),
    inboxSubscribe: () => call<void>("events_inbox_subscribe"),
    inbox_subscribe: () => call<void>("events_inbox_subscribe"),
  };
}
