import type { TurnEventBody } from "@tethys/bindings";
import { beforeEach, describe, expect, it } from "vitest";
import {
  advanceCancellationState,
  applyPatch,
  CANCEL_FIXTURE_DEADLINE,
  cancelPhaseFixtures,
  cancelPhaseToState,
  clearAllSessionStoresForTesting,
  clearAllSessionStreamsForTesting,
  configOptionFixtures,
  createInitialSessionState,
  createSessionStore,
  getOrCreateSessionStore,
  getSessionStreamManager,
  type HistoryDividerEntry,
  hydrateSessionView,
  loadHistoryIntoSession,
  NO_GIT_REVERT_REASON,
  PERMISSION_MODE_LABELS,
  providerExtensionFixture,
  resolveReviewGate,
  SessionStreamManager,
  selectCancellationState,
  selectGraceDeadline,
  selectInboxItems,
  selectIsStopDestructive,
  selectProviderCancelPhase,
  selectTurnActionsVisible,
  selectWorkspaceProviderSessionGroups,
  sessionReducer,
  setCustomRafScheduler,
  stopReasonFixtures,
  type TurnMessageEntry,
  threadStateToStatusKey,
  toolCallPatchFixture,
  toolKindFixtures,
  toolOriginFixtures,
  usageSnapshotFixture,
  workspaceCapabilityFixtures,
} from "./index";

describe("@tethys/state Store & Reducer Architecture (U7 / D5)", () => {
  beforeEach(() => {
    clearAllSessionStoresForTesting();
    clearAllSessionStreamsForTesting();
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

  it("reports the furthest cancel phase among a Provider's threads only", () => {
    const at = (
      id: string,
      providerId: string,
      cancellationState: "idle" | "cancel_requested" | "grace_elapsed",
    ) => ({
      ...createInitialSessionState(id, providerId, "ws", id),
      cancellationState,
    });
    const sessions = {
      a: at("a", "claude", "cancel_requested"),
      b: at("b", "claude", "grace_elapsed"),
      c: at("c", "other", "idle"),
    };
    expect(selectProviderCancelPhase(sessions, "claude")).toBe("grace_elapsed");
    expect(selectProviderCancelPhase(sessions, "other")).toBe("idle");
    expect(selectProviderCancelPhase(sessions, "unknown")).toBe("idle");
  });

  it("applies the backend's cancel phases, with a real deadline, and never invents one", () => {
    let state = createInitialSessionState("s1", "p-1", "ws-1", "Cancel me");
    const apply = (phase: keyof typeof cancelPhaseFixtures) => {
      state = sessionReducer(state, {
        type: "CancelPhaseChanged",
        body: cancelPhaseFixtures[phase],
      });
    };

    apply("cancel-requested");
    expect(state.cancellationState).toBe("cancel_requested");
    expect(state.graceDeadline).toBe(CANCEL_FIXTURE_DEADLINE);

    apply("grace-elapsed");
    expect(state.cancellationState).toBe("grace_elapsed");
    expect(state.graceDeadline).toBeNull();

    apply("terminating");
    expect(state.cancellationState).toBe("terminating");

    apply("idle");
    expect(state.cancellationState).toBe("idle");
    expect(state.graceDeadline).toBeNull();
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

  it("refuses an illegal jump and clears the deadline on grace_elapsed", () => {
    const store = createSessionStore(
      createInitialSessionState("s-cancel", "p-1", "ws-1"),
    );

    // idle -> terminating is not a legal transition.
    advanceCancellationState(store, "terminating");
    expect(selectCancellationState(store.state)).toBe("idle");

    advanceCancellationState(
      store,
      "cancel_requested",
      CANCEL_FIXTURE_DEADLINE,
    );
    expect(selectGraceDeadline(store.state)).toBe(CANCEL_FIXTURE_DEADLINE);

    advanceCancellationState(store, "grace_elapsed");
    expect(selectGraceDeadline(store.state)).toBeNull();
  });

  it("maps each schema CancelPhase fixture onto the store union", () => {
    const expected: Record<string, string> = {
      idle: "idle",
      "cancel-requested": "cancel_requested",
      "grace-elapsed": "grace_elapsed",
      terminating: "terminating",
    };

    for (const [phaseKey, fixture] of Object.entries(cancelPhaseFixtures)) {
      const view = cancelPhaseToState(fixture.phase);
      expect(view.state).toBe(expected[phaseKey]);
      expect(view.graceDeadline === null).toBe(phaseKey !== "cancel-requested");
    }
    expect(
      cancelPhaseToState(cancelPhaseFixtures["cancel-requested"].phase),
    ).toEqual({
      state: "cancel_requested",
      graceDeadline: CANCEL_FIXTURE_DEADLINE,
    });
  });

  it("threadStateToStatusKey covers all seven generated ThreadState values", () => {
    expect(Object.keys(threadStateToStatusKey)).toHaveLength(7);
    expect(threadStateToStatusKey.AwaitingApproval).toBe("awaiting_approval");
  });
});

describe("Workspace capability seams (M1.6b)", () => {
  it("exposes the four canonical fixture shapes", () => {
    expect(Object.keys(workspaceCapabilityFixtures).sort()).toEqual([
      "git-local",
      "git-no-restore",
      "git-remote",
      "no-git",
    ]);

    expect(workspaceCapabilityFixtures["git-remote"].vcs).toEqual({
      kind: "git-remote",
      host: "github",
    });
    expect(workspaceCapabilityFixtures["git-local"].vcs).toEqual({
      kind: "git-local",
    });
    expect(workspaceCapabilityFixtures["no-git"]).toEqual({
      vcs: { kind: "none" },
      restore: false,
      max_concurrent_sessions: 1,
    });
    expect(workspaceCapabilityFixtures["git-no-restore"].restore).toBe(false);
  });

  it("labels every permission mode", () => {
    const modes = ["supervised", "auto-edit", "yolo"] as const;
    for (const mode of modes) {
      expect(PERMISSION_MODE_LABELS[mode]).toBeTruthy();
    }
    expect(PERMISSION_MODE_LABELS.yolo).toBe("YOLO");
  });
});

describe("Thread-view contract fixtures (M1.6c U13)", () => {
  it("covers all ten ACP tool kinds and four origins", () => {
    expect(toolKindFixtures).toHaveLength(10);
    expect(toolOriginFixtures.map((origin) => origin.kind)).toEqual([
      "builtin",
      "mcp",
      "skill",
      "subagent",
    ]);
  });

  it("carries the new config, usage and stop-reason fields", () => {
    expect(
      configOptionFixtures.find((option) => option.id === "thought_level")
        ?.category,
    ).toBe("thought_level");
    const modelOption = configOptionFixtures.find(
      (option) => option.id === "model",
    );
    expect(modelOption?.value_options).toContainEqual({
      id: "sonnet",
      name: "Sonnet",
      description: null,
    });
    expect(usageSnapshotFixture.context_size).toBe(200_000);
    expect(usageSnapshotFixture.cost_currency).toBe("USD");
    expect(stopReasonFixtures).toContain("MaxTurnRequests");
  });

  it("does not populate origin or parent_tool_call_id by default", () => {
    expect(providerExtensionFixture.method).toBe("_kiro.dev/mcp/oauth_request");
    expect(toolCallPatchFixture.parent_tool_call_id).toBeNull();
  });
});

describe("Inspector session model (M1.7 U5)", () => {
  beforeEach(() => {
    clearAllSessionStoresForTesting();
    clearAllSessionStreamsForTesting();
    setCustomRafScheduler(null, null);
  });

  it("hydrates a cold route from its typed thread view before opening the stream", () => {
    const view = {
      thread: {
        id: "thread-1",
        workspace_id: "workspace-1",
        agent_profile_id: "codex-profile",
        title: "Review changes",
        workdir: "/workspace",
        state: "Idle" as const,
        session_id: "session-1",
      },
      events: [
        {
          thread_id: "thread-1",
          seq: 3,
          event: {
            type: "MessageUpsert" as const,
            body: {
              message_id: "message-1",
              role: "Agent" as const,
              content: {
                type: "Set" as const,
                value: [{ Text: "Restored reply" }],
              },
            },
          },
        },
      ],
      config_options: [],
      capabilities: null,
      permission_mode: "supervised" as const,
      latest_seq: 5,
    };

    const store = hydrateSessionView(view);
    const manager = getSessionStreamManager("thread-1", store, view.latest_seq);
    expect(store.state.providerId).toBe("codex-profile");
    expect(store.state.workspaceId).toBe("workspace-1");
    expect(store.state.title).toBe("Review changes");
    expect(store.state.liveEntries[0]).toMatchObject({
      id: "message-1",
      content: "Restored reply",
    });
    expect(manager.getSinceSeq()).toBe(5);
  });

  it("keeps one plan entry updated in place", () => {
    const event = (contents: string[]): TurnEventBody =>
      ({
        type: "PlanUpsert",
        body: {
          plan_id: "default",
          plan: {
            entries: contents.map((content) => ({
              content,
              priority: "Medium",
              status: "Pending",
            })),
          },
        },
      }) as TurnEventBody;

    let state = createInitialSessionState("s-1", "p-1", "ws-1");
    state = sessionReducer(state, event(["a", "b"]));
    state = sessionReducer(state, event(["a", "b", "c"]));

    const plans = state.liveEntries.filter((entry) => entry.kind === "plan");
    expect(plans).toHaveLength(1);
    expect((plans[0] as { steps: unknown[] }).steps).toHaveLength(3);
  });

  it("places one turn-end marker after each completed user turn", () => {
    let state = createInitialSessionState("s-turn", "p-1", "ws-1");
    state = sessionReducer(state, {
      type: "MessageUpsert",
      body: {
        message_id: "user-1",
        role: "User",
        content: { type: "Set", value: [{ Text: "Change a file" }] },
      },
    });
    state = sessionReducer(state, {
      type: "StateChanged",
      body: { state: "Running" },
    });
    state = sessionReducer(state, {
      type: "StateChanged",
      body: { state: { Idle: { stop_reason: "EndTurn" } } },
    });

    expect(state.liveEntries.at(-1)).toMatchObject({
      kind: "turn_end",
      turn: 1,
    });
    state = sessionReducer(state, {
      type: "StateChanged",
      body: { state: { Idle: { stop_reason: "EndTurn" } } },
    });
    expect(state.liveEntries.filter((entry) => entry.kind === "turn_end")).toHaveLength(1);
  });

  it("accumulates terminal output chunks in order", () => {
    let state = createInitialSessionState("s-1", "p-1", "ws-1");
    state = sessionReducer(state, {
      type: "TerminalUpsert",
      body: { terminal_id: "t1", patch: { type: "Set", value: "hello " } },
    } as TurnEventBody);
    state = sessionReducer(state, {
      type: "TerminalOutputChunk",
      body: { terminal_id: "t1", bytes: "world" },
    } as TurnEventBody);
    state = sessionReducer(state, {
      type: "TerminalOutputChunk",
      body: { terminal_id: "t1", bytes: "!" },
    } as TurnEventBody);

    const terminals = state.liveEntries.filter(
      (entry) => entry.kind === "terminal",
    );
    expect(terminals).toHaveLength(1);
    expect((terminals[0] as { output: string }).output).toBe("hello world!");
  });

  it("materializes one elicitation entry and clears it from pending", () => {
    let state = createInitialSessionState("s-1", "p-1", "ws-1");
    state = sessionReducer(state, {
      type: "ElicitationRequested",
      body: {
        req_id: "elicit-1",
        title: "Project details",
        description: null,
        url: null,
        fields: [],
      },
    } as TurnEventBody);
    expect(state.pendingElicitations).toHaveLength(1);
    expect(state.status).toBe("awaiting_approval");

    state = sessionReducer(state, {
      type: "ElicitationResolved",
      body: { req_id: "elicit-1", outcome: "accepted", values: {} },
    } as TurnEventBody);

    expect(state.pendingElicitations).toHaveLength(0);
    const entry = state.liveEntries.find((e) => e.kind === "elicitation");
    expect((entry as { resolution?: unknown }).resolution).toBeDefined();
  });

  it("aggregates the inbox across sessions from one source of truth", () => {
    const withPermission = (sessionId: string) => {
      let state = createInitialSessionState(sessionId, "p-1", "ws-1");
      state = sessionReducer(state, {
        type: "PermissionRequested",
        body: {
          req_id: `perm-${sessionId}`,
          title: "Run tests",
          description: null,
          subject: null,
          options: [],
        },
      } as TurnEventBody);
      return state;
    };

    const first = withPermission("s-1");
    const second = withPermission("s-2");
    const inbox = selectInboxItems([first, second]);
    expect(inbox).toHaveLength(2);
    expect(inbox.map((item) => item.sessionId)).toEqual(["s-1", "s-2"]);

    const resolved = sessionReducer(second, {
      type: "PermissionResolved",
      body: { req_id: "perm-s-2", outcome: "Approved", decided_by: "User" },
    } as TurnEventBody);
    expect(selectInboxItems([first, resolved])).toHaveLength(1);
  });

  it("gates per-turn actions on capability", () => {
    expect(
      selectTurnActionsVisible(workspaceCapabilityFixtures["no-git"]),
    ).toEqual({
      viewDiff: false,
      restore: false,
    });
    expect(
      selectTurnActionsVisible(workspaceCapabilityFixtures["git-remote"]),
    ).toEqual({ viewDiff: true, restore: true });
    // An unresolved workspace offers neither rather than guessing one.
    expect(selectTurnActionsVisible(null)).toEqual({
      viewDiff: false,
      restore: false,
    });
    expect(
      selectTurnActionsVisible(workspaceCapabilityFixtures["git-no-restore"]),
    ).toEqual({ viewDiff: true, restore: false });
  });
});

describe("turn endings and attachments (M1.7 U17/U18)", () => {
  function idle(stop_reason: unknown): TurnEventBody {
    return {
      type: "StateChanged",
      body: { state: { Idle: { stop_reason } } },
    } as TurnEventBody;
  }

  it("materializes a visible turn-notice for every non-normal stop reason", () => {
    for (const stop_reason of [
      "Refusal",
      "MaxTokens",
      "MaxTurnRequests",
      "Cancelled",
    ]) {
      const state = sessionReducer(
        createInitialSessionState("s", "p", "ws"),
        idle(stop_reason),
      );
      expect(state.entries.some((entry) => entry.kind === "turn_notice")).toBe(
        true,
      );
    }
  });

  it("renders no notice for a normal end of turn", () => {
    const state = sessionReducer(
      createInitialSessionState("s", "p", "ws"),
      idle("EndTurn"),
    );
    expect(state.entries.some((entry) => entry.kind === "turn_notice")).toBe(
      false,
    );
  });

  it("materializes a retryable error notice", () => {
    const state = sessionReducer(createInitialSessionState("s", "p", "ws"), {
      type: "Error",
      body: { code: "boom", message: "Boom", retryable: true },
    } as TurnEventBody);
    const notice = state.entries.find((entry) => entry.kind === "turn_notice");
    expect(notice).toBeTruthy();
    expect((notice as { retryable?: boolean }).retryable).toBe(true);
  });

  it("keeps non-text attachments and clears streaming at the stop reason", () => {
    const withMessage = sessionReducer(
      createInitialSessionState("s", "p", "ws"),
      {
        type: "MessageUpsert",
        body: {
          message_id: "m1",
          role: "Agent",
          content: {
            type: "Set",
            value: [
              { Text: "hello" },
              { Image: { mime_type: "image/png", data: "AAAA" } },
            ],
          },
        },
      } as unknown as TurnEventBody,
    );
    const entry = withMessage.entries.find(
      (candidate) => candidate.id === "m1",
    ) as TurnMessageEntry;
    expect(entry.attachments).toHaveLength(1);
    expect(entry.streaming).toBe(true);

    const ended = sessionReducer(withMessage, idle("EndTurn"));
    const endedEntry = ended.entries.find(
      (candidate) => candidate.id === "m1",
    ) as TurnMessageEntry;
    expect(endedEntry.streaming).toBe(false);
  });
});

describe("resolveReviewGate (M1.9 U6)", () => {
  it("git-remote: diff, stage and revert all available", () => {
    expect(
      resolveReviewGate(workspaceCapabilityFixtures["git-remote"]),
    ).toEqual({
      showDiff: true,
      showStage: true,
      showRevert: true,
      hiddenReason: null,
    });
  });

  it("git-local: local git still restores", () => {
    expect(resolveReviewGate(workspaceCapabilityFixtures["git-local"])).toEqual(
      {
        showDiff: true,
        showStage: true,
        showRevert: true,
        hiddenReason: null,
      },
    );
  });

  it("git-no-restore: diff and stage without revert", () => {
    expect(
      resolveReviewGate(workspaceCapabilityFixtures["git-no-restore"]),
    ).toEqual({
      showDiff: true,
      showStage: true,
      showRevert: false,
      hiddenReason: null,
    });
  });

  it("no-git: the whole surface is hidden with a stated reason", () => {
    expect(resolveReviewGate(workspaceCapabilityFixtures["no-git"])).toEqual({
      showDiff: false,
      showStage: false,
      showRevert: false,
      hiddenReason: NO_GIT_REVERT_REASON,
    });
  });
});
