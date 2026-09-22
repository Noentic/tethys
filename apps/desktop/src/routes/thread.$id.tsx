import { InspectorScreen } from "@tethys/features";
import { client } from "../client";

export interface ThreadViewProps {
  sessionId: string;
}

/**
 * Thin route mount (D13): resolves the session id and renders the feature
 * `InspectorScreen`, which owns the transcript, the interaction cards and the
 * approval inbox through the slot registries.
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
