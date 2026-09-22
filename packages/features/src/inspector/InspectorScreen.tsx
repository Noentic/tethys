import {
  getOrCreateSessionStore,
  type SessionEntry,
  SessionStreamManager,
  type ToolCallEntry,
  useSessionCapabilities,
  type WorkspaceCapabilityFixture,
} from "@tethys/state";
import { cn } from "@tethys/ui";
import { useEffect, useRef, useState } from "react";
import {
  canDockComposer,
  type InspectorClient,
  InspectorClientProvider,
} from "../client-context";
import { DockedPromptCard } from "../composer/docked-prompt-card";
import { enqueueProviderExtension } from "../providers/pending-extensions";
import { latestAnnouncement, TranscriptAnnouncer } from "./announcer";
import { registerInspectorRenderers } from "./register";
import { JumpToLatest } from "./renderers/jump-to-latest";
import { WorkingIndicator } from "./renderers/working-indicator";
import { TranscriptStage } from "./TranscriptStage";
import { useSessionState } from "./use-session-state";
import { useTailPin } from "./use-tail-pin";

registerInspectorRenderers();

/**
 * The active-thread surface (M1.7/M1.8). A thin mount for the route (D13): it
 * resolves the session store, subscribes to `events.subscribe` through the
 * client, and renders the transcript stage. The Inspector is a shell region
 * (`apps/desktop/src/shell/InspectorPane.tsx`), so this renders none of its own.
 */
export function InspectorScreen({
  sessionId,
  client,
  capabilityFixture,
  className,
}: {
  sessionId: string;
  client: InspectorClient;
  capabilityFixture?: WorkspaceCapabilityFixture;
  className?: string;
}) {
  const state = useSessionState(sessionId);
  const capabilities = useSessionCapabilities(sessionId, capabilityFixture);
  const [streamError, setStreamError] = useState<string | null>(null);
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
    setStreamError(null);
    if (client.events) {
      try {
        client.events
          .subscribe(sessionId, manager.getSinceSeq(), (event) => {
            manager.pushEvent({
              sessionId,
              seq: event.seq,
              event: event.event,
            });
            if (event.event.type === "ProviderExtension") {
              enqueueProviderExtension(event.event.body);
            }
          })
          .catch((cause: unknown) => {
            // A thread this process does not hold (one from a previous run)
            // fails here; say so instead of rendering an empty transcript.
            setStreamError(
              cause instanceof Error ? cause.message : String(cause),
            );
          });
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
        className={cn("flex min-h-0 flex-1 flex-col gap-md p-md", className)}
      >
        {streamError && (
          <p
            role="alert"
            title={streamError}
            className="shrink-0 text-body-sm text-(--tethys-status-danger)"
          >
            This thread could not be opened.
          </p>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* The stage is a `log` region with live announcements off: a chunk is
              never announced. The polite announcer below speaks the few things
              worth interrupting for (DESIGN.md Transcript semantics). */}
          <div
            ref={scrollRef}
            role="log"
            aria-label="Transcript"
            aria-live="off"
            aria-busy={state.status === "running"}
            className="min-h-0 flex-1 overflow-auto"
          >
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
        {canDockComposer(client) && (
          <div className="shrink-0">
            <DockedPromptCard
              sessionId={sessionId}
              client={client}
              noGit={capabilities?.vcs.kind === "none"}
            />
          </div>
        )}
      </div>
    </InspectorClientProvider>
  );
}
