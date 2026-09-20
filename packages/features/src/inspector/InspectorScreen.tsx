import type { WorkspaceCapabilityFixture } from "@tethys/state";
import {
  getOrCreateSessionStore,
  type SessionEntry,
  type SessionState,
  SessionStreamManager,
  type ToolCallEntry,
} from "@tethys/state";
import { cn, getAllInspectorSlots } from "@tethys/ui";
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  type InspectorClient,
  InspectorClientProvider,
} from "../client-context";
import { enqueueProviderExtension } from "../providers/pending-extensions";
import { latestAnnouncement, TranscriptAnnouncer } from "./announcer";
import { registerInspectorRenderers } from "./register";
import { JumpToLatest } from "./renderers/jump-to-latest";
import { WorkingIndicator } from "./renderers/working-indicator";
import { TranscriptStage } from "./TranscriptStage";
import { useCapabilities } from "./use-capabilities";
import { useTailPin } from "./use-tail-pin";

registerInspectorRenderers();

function useSessionState(sessionId: string): SessionState {
  const store = getOrCreateSessionStore(sessionId);
  return useSyncExternalStore(
    (onStoreChange) => {
      const subscription = store.subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    () => store.state,
  );
}

function InspectorSlots({
  state,
  sessionId,
}: {
  state: SessionState;
  sessionId: string;
}) {
  const plan = state.liveEntries.find((entry) => entry.kind === "plan") as
    | { steps?: unknown }
    | undefined;
  const slots = getAllInspectorSlots();
  if (slots.length === 0) {
    return (
      <p className="p-md text-body-sm text-(--tethys-text-muted)">
        No inspector slots registered
      </p>
    );
  }
  return (
    <>
      {slots.map(([id, Slot]) => (
        <Slot
          key={id}
          sessionId={sessionId}
          data={id === "plan" ? plan?.steps : state.entries}
        />
      ))}
    </>
  );
}

/**
 * The active-thread surface (M1.7/M1.8). A thin mount for the route (D13): it
 * resolves the session store, subscribes to `events.subscribe` through the
 * client, and composes the transcript stage with the registered Inspector slots.
 */
export function InspectorScreen({
  sessionId,
  client,
  capabilityFixture = "git-remote",
  className,
}: {
  sessionId: string;
  client: InspectorClient;
  capabilityFixture?: WorkspaceCapabilityFixture;
  className?: string;
}) {
  const state = useSessionState(sessionId);
  const capabilities = useCapabilities(capabilityFixture);
  const managerRef = useRef<SessionStreamManager | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { pinned, newCount, jumpToLatest } = useTailPin(
    scrollRef,
    state.entries.length,
  );

  useEffect(() => {
    const store = getOrCreateSessionStore(sessionId);
    const manager = new SessionStreamManager(store, store.state.seq);
    managerRef.current = manager;
    if (client.events) {
      try {
        void client.events.subscribe(
          sessionId,
          manager.getSinceSeq(),
          (event) => {
            manager.pushEvent({
              sessionId,
              seq: event.seq,
              event: event.event,
            });
            if (event.event.type === "ProviderExtension") {
              enqueueProviderExtension(event.event.body);
            }
          },
        );
      } catch {
        // Outside Tauri (tests, browser preview) there is no channel; the
        // store still renders whatever was seeded directly.
      }
    }
    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, [client, sessionId]);

  const handleViewDiff = (_entry: SessionEntry) => {
    // M1.9 owns the diff viewer; the entry point only opens the Inspector.
  };

  const hasPending =
    state.pendingPermissions.length > 0 || state.pendingElicitations.length > 0;
  const lastTimestamp = state.entries[state.entries.length - 1]?.timestamp;
  const inFlight = state.liveEntries.find(
    (entry): entry is ToolCallEntry =>
      entry.kind === "tool_call" &&
      (entry as ToolCallEntry).status === "Executing",
  );

  return (
    <InspectorClientProvider client={client} threadId={sessionId}>
      <div
        data-testid="inspector-screen"
        className={cn("flex min-h-0 flex-1 gap-md p-md", className)}
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
            <TranscriptStage
              entries={state.entries}
              capabilities={capabilities}
              onViewDiff={handleViewDiff}
            />
          </div>
          {state.status === "running" && (
            <WorkingIndicator
              startedAt={lastTimestamp ?? Date.now()}
              lastEventAt={lastTimestamp ?? Date.now()}
              inFlightTitle={inFlight?.title}
            />
          )}
          <JumpToLatest
            visible={!pinned}
            newCount={newCount}
            hasPending={hasPending}
            onJump={jumpToLatest}
          />
          <TranscriptAnnouncer
            announcement={latestAnnouncement(state.entries)}
          />
        </div>
        <aside
          data-testid="inspector-pane"
          className="w-72 shrink-0 overflow-auto border-l border-(--tethys-hairline)"
        >
          <InspectorSlots state={state} sessionId={sessionId} />
        </aside>
      </div>
    </InspectorClientProvider>
  );
}
