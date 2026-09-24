import { batch } from "@tanstack/store";
import type {
  EventEnvelope,
  ThreadSessionView,
  TurnEventBody,
} from "@tethys/bindings";
import {
  createInitialSessionState,
  type SessionState,
  sessionReducer,
} from "./reducers";
import { getOrCreateSessionStore, type SessionStore } from "./stores";
import { threadStateToStatusKey } from "./thread-state";

export interface StreamEventEnvelope {
  sessionId: string;
  seq: number;
  event: TurnEventBody;
  /** When Core recorded the event, in Unix ms (`EventEnvelope.at_ms`). */
  at_ms?: number | null;
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

  public hydrateThrough(seq: number): void {
    this.highestSeq = Math.max(this.highestSeq, seq);
    this.pendingQueue = this.pendingQueue.filter((event) => event.seq > seq);
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
          state = sessionReducer(state, env.event, env.seq, env.at_ms);
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

interface ManagedStream {
  store: SessionStore;
  manager: SessionStreamManager;
  subscribers: number;
  started: boolean;
  source?: SessionEventSource;
}

export interface SessionEventSource {
  subscribe(
    threadId: string,
    sinceSeq: number,
    onEvent: (event: EventEnvelope) => void,
  ): Promise<void>;
  unsubscribe?(threadId: string): Promise<void>;
}

const managedStreams = new Map<string, ManagedStream>();
const hydratedSessions = new Set<string>();

/** Whether a cold-open hydration already seeded this session's store. */
export function isSessionHydrated(sessionId: string): boolean {
  return hydratedSessions.has(sessionId);
}

/** Rebuilds the shared session store from a typed cold-open response. */
export function hydrateSessionView(view: ThreadSessionView): SessionStore {
  const thread = view.thread;
  const store = getOrCreateSessionStore(
    thread.id,
    thread.agent_profile_id,
    thread.workspace_id,
    thread.title,
    undefined,
    thread.workdir,
  );
  if (store.state.seq <= view.latest_seq) {
    let state = createInitialSessionState(
      thread.id,
      thread.agent_profile_id,
      thread.workspace_id,
      thread.title,
      undefined,
      thread.workdir,
    );
    for (const event of [...view.events].sort((a, b) => a.seq - b.seq)) {
      state = sessionReducer(state, event.event, event.seq, event.at_ms);
    }
    state = {
      ...state,
      seq: view.latest_seq,
      status: threadStateToStatusKey[thread.state] ?? state.status,
      permissionMode: view.permission_mode,
      configOptions: view.config_options,
      capabilities: view.capabilities,
    };
    store.setState(() => state);
  }
  hydratedSessions.add(thread.id);
  managedStreams.get(thread.id)?.manager.hydrateThrough(view.latest_seq);
  return store;
}

/**
 * Shares one deduplicating manager and one ACP event subscription per thread.
 * Start-session can hydrate the manager before navigation; the Inspector then
 * attaches the stream and receives anything committed after that cursor.
 */
export function getSessionStreamManager(
  sessionId: string,
  store: SessionStore,
  initialSeq = 0,
): SessionStreamManager {
  const existing = managedStreams.get(sessionId);
  if (existing) return existing.manager;
  const manager = new SessionStreamManager(store, initialSeq);
  managedStreams.set(sessionId, {
    store,
    manager,
    subscribers: 0,
    started: false,
  });
  return manager;
}

/** Attaches an Inspector to the shared stream and returns its release handle. */
export function subscribeSessionStream(
  sessionId: string,
  store: SessionStore,
  source: SessionEventSource,
  onEvent: (event: EventEnvelope) => void,
  onError: (error: unknown) => void,
): () => void {
  const manager = getSessionStreamManager(sessionId, store, store.state.seq);
  const entry = managedStreams.get(sessionId);
  if (!entry) return () => {};
  entry.subscribers += 1;
  if (!entry.started) {
    entry.started = true;
    entry.source = source;
    void source
      .subscribe(sessionId, manager.getSinceSeq(), (event) => {
        manager.pushEvent({
          sessionId,
          seq: event.seq,
          event: event.event,
          at_ms: event.at_ms,
        });
        onEvent(event);
      })
      .catch(onError);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = managedStreams.get(sessionId);
    if (!current) return;
    current.subscribers = Math.max(0, current.subscribers - 1);
    if (current.subscribers === 0) {
      current.manager.destroy();
      managedStreams.delete(sessionId);
      const unsubscribe = current.source?.unsubscribe;
      if (unsubscribe) void unsubscribe(sessionId).catch(onError);
    }
  };
}

export function clearAllSessionStreamsForTesting(): void {
  for (const stream of managedStreams.values()) stream.manager.destroy();
  managedStreams.clear();
  hydratedSessions.clear();
}
