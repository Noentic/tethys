import { batch } from "@tanstack/store";
import type { TurnEventBody } from "@tethys/bindings";
import { type SessionState, sessionReducer } from "./reducers";
import type { SessionStore } from "./stores";

export interface StreamEventEnvelope {
  sessionId: string;
  seq: number;
  event: TurnEventBody;
}

export type RafScheduler = (callback: (time: number) => void) => number;
export type CancelRafScheduler = (handle: number) => void;

let customRaf: RafScheduler | null = null;
let customCancelRaf: CancelRafScheduler | null = null;

export function setCustomRafScheduler(
  raf: RafScheduler | null,
  cancelRaf: CancelRafScheduler | null,
): void {
  customRaf = raf;
  customCancelRaf = cancelRaf;
}

function scheduleFrame(cb: (time: number) => void): number {
  if (customRaf) {
    return customRaf(cb);
  }
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(cb);
  }
  return setTimeout(() => cb(Date.now()), 16) as unknown as number;
}

function cancelFrame(handle: number): void {
  if (customCancelRaf) {
    customCancelRaf(handle);
  } else if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(handle);
  } else {
    clearTimeout(handle);
  }
}

export class SessionStreamManager {
  private sessionStore: SessionStore;
  private pendingQueue: StreamEventEnvelope[] = [];
  private highestSeq = 0;
  private rafId: number | null = null;
  private isDestroyed = false;

  constructor(sessionStore: SessionStore, initialSeq = 0) {
    this.sessionStore = sessionStore;
    this.highestSeq = Math.max(initialSeq, sessionStore.state.seq);
  }

  public getSinceSeq(): number {
    return this.highestSeq;
  }

  public pushEvent(envelope: StreamEventEnvelope): boolean {
    if (this.isDestroyed) return false;

    // Deduplicate if already processed
    if (envelope.seq <= this.highestSeq) {
      return false;
    }

    this.pendingQueue.push(envelope);

    if (this.rafId === null) {
      this.rafId = scheduleFrame(() => this.flush());
    }

    return true;
  }

  public pushEvents(envelopes: StreamEventEnvelope[]): number {
    let accepted = 0;
    for (const env of envelopes) {
      if (this.pushEvent(env)) {
        accepted++;
      }
    }
    return accepted;
  }

  public flush(): void {
    this.rafId = null;
    if (this.pendingQueue.length === 0 || this.isDestroyed) return;

    const eventsToApply = this.pendingQueue;
    this.pendingQueue = [];

    // Apply all events in a batch so subscribers are notified once per frame
    batch(() => {
      let state: SessionState = this.sessionStore.state;
      for (const env of eventsToApply) {
        if (env.seq > this.highestSeq) {
          state = sessionReducer(state, env.event, env.seq);
          this.highestSeq = env.seq;
        }
      }
      this.sessionStore.setState(() => state);
    });
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.rafId !== null) {
      cancelFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingQueue = [];
  }
}
