//! `events.*` client namespace. Wave 2 owner: A (M1.7/M1.8).
//!
//! `subscribe` opens a Tauri `Channel` and feeds each `EventEnvelope` to the
//! caller (the `SessionStreamManager` batches them into the store).

import { Channel } from "@tauri-apps/api/core";
import type { EventEnvelope } from "@tethys/bindings";

import type { Call } from "../transport";

export function eventsNamespace(call: Call) {
  return {
    /** `events.subscribe` — replays from `sinceSeq` then streams live events. */
    subscribe: (
      threadId: string,
      sinceSeq: number,
      onEvent: (event: EventEnvelope) => void,
    ): Promise<void> => {
      const channel = new Channel<EventEnvelope>();
      channel.onmessage = onEvent;
      return call<void>("events_subscribe", {
        threadId,
        sinceSeq,
        onEvent: channel,
      });
    },
    unsubscribe: (threadId: string) =>
      call<void>("events_unsubscribe", { threadId }),
    inboxSubscribe: () => call<void>("events_inbox_subscribe"),
    inbox_subscribe: () => call<void>("events_inbox_subscribe"),
  };
}
