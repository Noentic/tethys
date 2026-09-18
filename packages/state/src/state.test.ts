import type { TurnEventBody } from "@tethys/bindings";
import { beforeEach, describe, expect, it } from "vitest";
import {
  advanceCancellationState,
  applyPatch,
  clearAllSessionStoresForTesting,
  createInitialSessionState,
  createSessionStore,
  getOrCreateSessionStore,
  type HistoryDividerEntry,
  loadHistoryIntoSession,
  SessionStreamManager,
  selectCancellationState,
  selectIsStopDestructive,
  selectWorkspaceProviderSessionGroups,
  sessionReducer,
  setCustomRafScheduler,
  type TurnMessageEntry,
} from "./index";

describe("@tethys/state Store & Reducer Architecture (U7 / D5)", () => {
  beforeEach(() => {
    clearAllSessionStoresForTesting();
    setCustomRafScheduler(null, null);
  });

  it("applyPatch conforms to Rust Patch<T> semantics: unchanged, clear, set", () => {
    // Unchanged keeps current
    expect(applyPatch("original", { type: "Unchanged" })).toBe("original");
    // Clear sets to null
    expect(applyPatch("original", { type: "Clear" })).toBeNull();
    // Set replaces with new value
    expect(applyPatch("original", { type: "Set", value: "updated" })).toBe(
      "updated",
    );
  });

  it("reducer appends message chunks into a contiguous turn_message entry", () => {
    let state = createInitialSessionState("s-1", "p-1", "ws-1");

    const chunk1: TurnEventBody = {
      type: "MessageChunk",
      body: {
        message_id: "m-1",
        role: "Agent",
        block: { Text: "Hello " },
      },
    };
    const chunk2: TurnEventBody = {
      type: "MessageChunk",
      body: {
        message_id: "m-1",
        role: "Agent",
        block: { Text: "world!" },
      },
    };

    state = sessionReducer(state, chunk1, 1);
    state = sessionReducer(state, chunk2, 2);

    expect(state.liveEntries.length).toBe(1);
    const entry = state.liveEntries[0] as TurnMessageEntry;
    expect(entry.kind).toBe("turn_message");
    expect(entry.content).toBe("Hello world!");
    expect(state.seq).toBe(2);
  });

  it("stream manager batches 1000 events in a burst into 1 store notification per frame", () => {
    let frameCallback: ((time: number) => void) | null = null;
    let nextHandle = 1;

    setCustomRafScheduler(
      (cb) => {
        frameCallback = cb;
        return nextHandle++;
      },
      () => {
        frameCallback = null;
      },
    );

    const store = createSessionStore(
      createInitialSessionState("s-1", "p-1", "ws-1"),
    );
    const manager = new SessionStreamManager(store);

    let notificationCount = 0;
    store.subscribe(() => {
      notificationCount++;
    });

    // Burst 1000 chunks
    for (let i = 1; i <= 1000; i++) {
      manager.pushEvent({
        sessionId: "s-1",
        seq: i,
        event: {
          type: "MessageChunk",
          body: {
            message_id: "burst-msg",
            role: "Agent",
            block: { Text: "a" },
          },
        },
      });
    }

    // Prior to rAF flush, store subscribers have received 0 updates
    expect(notificationCount).toBe(0);
    expect(frameCallback).not.toBeNull();

    // Trigger rAF flush
    if (frameCallback) {
      const runner = frameCallback as (time: number) => void;
      runner(Date.now());
    }

    // Subscriber notified exactly once for all 1000 events!
    expect(notificationCount).toBe(1);
    const entry = store.state.liveEntries[0] as TurnMessageEntry;
    expect(entry.content.length).toBe(1000);
    expect(store.state.seq).toBe(1000);
  });

  it("sinceSeq resume replays only the tail and deduplicates past events", () => {
    const store = createSessionStore(
      createInitialSessionState("s-1", "p-1", "ws-1"),
    );
    const manager = new SessionStreamManager(store);

    // Initial stream of 10 events
    for (let i = 1; i <= 10; i++) {
      manager.pushEvent({
        sessionId: "s-1",
        seq: i,
        event: {
          type: "MessageChunk",
          body: {
            message_id: "m",
            role: "Agent",
            block: { Text: `${i},` },
          },
        },
      });
    }
    manager.flush();

    expect(manager.getSinceSeq()).toBe(10);

    // Disconnect & reconnect: replay attempts with overlapping seq 8..12
    for (let i = 8; i <= 12; i++) {
      manager.pushEvent({
        sessionId: "s-1",
        seq: i,
        event: {
          type: "MessageChunk",
          body: {
            message_id: "m",
            role: "Agent",
            block: { Text: `${i},` },
          },
        },
      });
    }
    manager.flush();

    expect(manager.getSinceSeq()).toBe(12);
    const entry = store.state.liveEntries[0] as TurnMessageEntry;
    // Should contain 1..10 and only 11, 12 added (no duplicate 8, 9, 10)
    expect(entry.content).toBe("1,2,3,4,5,6,7,8,9,10,11,12,");
  });

  it("narrow selector: updating one Session does not notify another Session's subscriber", () => {
    const store1 = getOrCreateSessionStore("s-1", "p-1", "ws-1");
    const store2 = getOrCreateSessionStore("s-2", "p-1", "ws-1");

    let store1Notifications = 0;
    let store2Notifications = 0;

    store1.subscribe(() => {
      store1Notifications++;
    });
    store2.subscribe(() => {
      store2Notifications++;
    });

    store1.setState((prev) => ({
      ...prev,
      status: "running",
    }));

    expect(store1Notifications).toBe(1);
    expect(store2Notifications).toBe(0);
  });

  it("three-level grouping selector: Workspace -> Provider -> Session preserves order", () => {
    const sessions = [
      createInitialSessionState("s-1", "p-claude", "ws-core", "Session 1"),
      createInitialSessionState("s-2", "p-codex", "ws-core", "Session 2"),
      createInitialSessionState("s-3", "p-claude", "ws-core", "Session 3"),
    ];

    const groups = selectWorkspaceProviderSessionGroups(sessions);
    expect(groups.length).toBe(1);
    expect(groups[0].workspaceId).toBe("ws-core");
    expect(groups[0].providers.length).toBe(2);

    expect(groups[0].providers[0].providerId).toBe("p-claude");
    expect(groups[0].providers[0].sessions.length).toBe(2);

    expect(groups[0].providers[1].providerId).toBe("p-codex");
    expect(groups[0].providers[1].sessions.length).toBe(1);

    // Adding a third provider's session preserves earlier provider ordering
    const sessionsWithThird = [
      ...sessions,
      createInitialSessionState("s-4", "p-opencode", "ws-core", "Session 4"),
    ];

    const groupsUpdated =
      selectWorkspaceProviderSessionGroups(sessionsWithThird);
    expect(groupsUpdated[0].providers.length).toBe(3);
    expect(groupsUpdated[0].providers[0].providerId).toBe("p-claude");
    expect(groupsUpdated[0].providers[1].providerId).toBe("p-codex");
    expect(groupsUpdated[0].providers[2].providerId).toBe("p-opencode");
  });

  it("history and live segments: cached history without resume shows division", () => {
    let state = createInitialSessionState("s-1", "p-1", "ws-1");
    const cachedHistory: TurnMessageEntry[] = [
      {
        id: "h-1",
        kind: "turn_message",
        role: "User",
        content: "Old question",
        timestamp: 1000,
      },
      {
        id: "h-2",
        kind: "turn_message",
        role: "Agent",
        content: "Old answer",
        timestamp: 1001,
      },
    ];

    // Case 1: Provider does NOT support resume -> two segments + history divider
    state = loadHistoryIntoSession(state, cachedHistory, false);
    // Now receive a live turn
    state = sessionReducer(
      state,
      {
        type: "MessageUpsert",
        body: {
          message_id: "live-1",
          role: "User",
          content: {
            type: "Set",
            value: [{ Text: "Fresh question" }],
          },
        },
      },
      1,
    );

    expect(state.historyEntries.length).toBe(2);
    expect(state.liveEntries.length).toBe(1);
    // entries should contain: [h1, h2, divider, live1]
    expect(state.entries.length).toBe(4);
    expect(state.entries[2].kind).toBe("history_divider");
    expect((state.entries[2] as HistoryDividerEntry).label).toBe(
      "Earlier history (read-only)",
    );

    // Case 2: Provider DOES support resume -> single contiguous segment without divider
    let resumedState = createInitialSessionState("s-2", "p-1", "ws-1");
    resumedState = loadHistoryIntoSession(resumedState, cachedHistory, true);
    expect(resumedState.historyEntries.length).toBe(0);
    expect(resumedState.liveEntries.length).toBe(2);
    expect(resumedState.entries.length).toBe(2);
  });

  it("permission state round-trips Provider options verbatim and records auto-resolution", () => {
    let state = createInitialSessionState("s-1", "p-1", "ws-1");

    const reqEvent: TurnEventBody = {
      type: "PermissionRequested",
      body: {
        req_id: "req-100",
        title: "Run command",
        description: "Execute cargo check",
        subject: null,
        options: [
          { option_id: "opt-allow", name: "Allow once", kind: "allow" },
          {
            option_id: "opt-always",
            name: "Allow always for this session",
            kind: "allow_always",
          },
          { option_id: "opt-reject", name: "Reject command", kind: "reject" },
        ],
      },
    };

    state = sessionReducer(state, reqEvent, 1);
    expect(state.status).toBe("awaiting_approval");
    expect(state.pendingPermissions.length).toBe(1);
    expect(state.pendingPermissions[0].options.length).toBe(3);
    expect(state.pendingPermissions[0].options[0].name).toBe("Allow once");

    // Auto-resolve by policy
    const resolveEvent: TurnEventBody = {
      type: "PermissionResolved",
      body: {
        req_id: "req-100",
        outcome: "Approved",
        decided_by: "Policy",
      },
    };

    state = sessionReducer(state, resolveEvent, 2);
    expect(state.pendingPermissions.length).toBe(0);
    expect(state.resolvedPermissions["req-100"]).toBeDefined();
    expect(state.resolvedPermissions["req-100"].autoPicked).toBe(true);
    expect(state.resolvedPermissions["req-100"].outcome).toBe("Approved");
  });

  it("cancellation state machine advances and is destructive only after grace_elapsed", () => {
    const store = createSessionStore(
      createInitialSessionState("s-1", "p-1", "ws-1"),
    );

    // Initial: idle -> not destructive
    expect(selectCancellationState(store.state)).toBe("idle");
    expect(selectIsStopDestructive(store.state.cancellationState)).toBe(false);

    // Step 1: cancel_requested -> neutral/pending, NOT destructive
    advanceCancellationState(store, "cancel_requested");
    expect(selectCancellationState(store.state)).toBe("cancel_requested");
    expect(selectIsStopDestructive(store.state.cancellationState)).toBe(false);

    // Step 2: grace_elapsed -> destructive (process ladder armed)
    advanceCancellationState(store, "grace_elapsed");
    expect(selectCancellationState(store.state)).toBe("grace_elapsed");
    expect(selectIsStopDestructive(store.state.cancellationState)).toBe(true);

    // Step 3: terminating -> destructive
    advanceCancellationState(store, "terminating");
    expect(selectCancellationState(store.state)).toBe("terminating");
    expect(selectIsStopDestructive(store.state.cancellationState)).toBe(true);

    // Reset back to idle
    advanceCancellationState(store, "idle");
    expect(selectCancellationState(store.state)).toBe("idle");
    expect(selectIsStopDestructive(store.state.cancellationState)).toBe(false);
  });
});
