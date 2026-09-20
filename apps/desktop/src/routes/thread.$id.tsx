import { createClient } from "@tethys/client";
import { InspectorScreen } from "@tethys/features";

const client = createClient();

export interface ThreadViewProps {
  sessionId: string;
}

/**
 * Thin route mount (D13): resolves the session id and renders the feature
 * `InspectorScreen`, which owns the transcript, the interaction cards, the
 * permission-mode pill and the inbox through the slot registries.
 */
export function ThreadView({ sessionId }: ThreadViewProps) {
  return (
    <InspectorScreen
      sessionId={sessionId}
      client={client}
      className="h-full w-full bg-(--tethys-canvas)"
    />
  );
}
