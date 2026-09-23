import {
  getOrCreateSessionStore,
  hydrateSessionView,
  isSessionHydrated,
  subscribeSessionStream,
  useSessionCapabilities,
  useTrustedWorkspaces,
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
import "../approvals/register";
import {
  dequeueProviderExtension,
  enqueueProviderExtension,
} from "../providers/pending-extensions";
import { ProviderPopover } from "../providers/provider-popover";
import { latestAnnouncement, TranscriptAnnouncer } from "./announcer";
import { registerInspectorRenderers } from "./register";
import { JumpToLatest } from "./renderers/jump-to-latest";
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
  const workspaces = useTrustedWorkspaces();
  const workspace = workspaces.find((item) => item.id === state.workspaceId);
  const worktreeEnabled = Boolean(
    capabilities &&
      capabilities.vcs.kind !== "none" &&
      workspace &&
      state.workdir !== workspace.path,
  );
  const [streamError, setStreamError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const providerAnchorRef = useRef<HTMLButtonElement>(null);
  const { pinned, newCount, jumpToLatest } = useTailPin(
    scrollRef,
    state.entries.length,
  );

  useEffect(() => {
    const store = getOrCreateSessionStore(sessionId);
    let cancelled = false;
    let releaseStream = () => {};
    setStreamError(null);
    const connect = async () => {
      // The `/thread/$id` route loader hydrates before first paint; only a
      // route that mounts without a hydrated store re-fetches here.
      const hydrated = isSessionHydrated(sessionId);
      if (!hydrated && client.thread?.get) {
        const view = await client.thread.get(sessionId);
        if (cancelled) return;
        hydrateSessionView(view);
      }
      if (!client.events || cancelled) return;
      releaseStream = subscribeSessionStream(
        sessionId,
        store,
        client.events,
        (event) => {
          if (
            event.event.type === "ProviderExtension" &&
            event.event.body.request_id
          ) {
            enqueueProviderExtension(sessionId, event.event.body);
          } else if (event.event.type === "ProviderExtensionResolved") {
            dequeueProviderExtension(sessionId, event.event.body.request_id);
          }
        },
        (cause) => {
          setStreamError(
            cause instanceof Error ? cause.message : String(cause),
          );
        },
      );
    };
    void connect().catch((cause: unknown) => {
      if (!cancelled) {
        setStreamError(cause instanceof Error ? cause.message : String(cause));
      }
    });
    return () => {
      cancelled = true;
      releaseStream();
    };
  }, [client, sessionId]);

  const hasPending =
    state.pendingPermissions.length > 0 || state.pendingElicitations.length > 0;
  return (
    <InspectorClientProvider client={client} threadId={sessionId}>
      <div
        data-testid="inspector-screen"
        className={cn("flex min-h-0 flex-1 flex-col gap-md p-md", className)}
      >
        {streamError && state.entries.length === 0 && (
          <p
            role="alert"
            title={streamError}
            className="mx-auto w-full max-w-(--layout-stage-measure) shrink-0 text-body-sm text-(--tethys-status-danger)"
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
              sessionId={sessionId}
              className="pb-lg"
            />
          </div>
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
              worktreeEnabled={worktreeEnabled}
              workspaceName={workspace?.name}
              providerAnchorRef={providerAnchorRef}
            />
            {client.thread.respondExtension && (
              <ProviderPopover
                threadId={sessionId}
                anchorRef={providerAnchorRef}
                onRespond={(requestId, response) =>
                  client.thread?.respondExtension?.(
                    sessionId,
                    requestId,
                    response,
                  ) ??
                  Promise.reject(new Error("Extension response is unavailable"))
                }
              />
            )}
          </div>
        )}
      </div>
    </InspectorClientProvider>
  );
}
