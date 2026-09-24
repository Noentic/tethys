import { InspectorScreen } from "@tethys/features";
import { Skeleton } from "@tethys/ui";
import { client } from "../client";

export interface ThreadViewProps {
  sessionId: string;
  onNavigateThread?: (id: string) => void;
}

/**
 * Thin route mount (D13): resolves the session id and renders the feature
 * `InspectorScreen`, which owns the transcript, the interaction cards and the
 * approval inbox through the slot registries.
 */
export function ThreadView({ sessionId, onNavigateThread }: ThreadViewProps) {
  return (
    <InspectorScreen
      sessionId={sessionId}
      client={client}
      onNavigateThread={onNavigateThread}
      className="h-full w-full bg-(--tethys-canvas)"
    />
  );
}

/**
 * Route pending surface (`pendingComponent`): the shell chrome commits as soon
 * as navigation starts, so a slow ACP bootstrap shows an honest transcript
 * skeleton instead of leaving the previous route on screen. The Inspector
 * still mounts only after the loader hydrates the session store.
 */
export function ThreadOpeningView() {
  return (
    <div
      role="status"
      aria-label="Opening thread"
      data-testid="thread-opening"
      className="flex h-full w-full flex-col items-center gap-lg px-4 pt-5"
    >
      <span className="sr-only">Opening thread…</span>
      <div className="flex w-full max-w-[720px] flex-col gap-sm">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="flex w-full max-w-[720px] flex-col gap-sm">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}
