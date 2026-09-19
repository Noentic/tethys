import { getOrCreateSessionStore } from "@tethys/state";
import { Stage } from "../shell/Stage";

export interface ThreadViewProps {
  sessionId: string;
}

export function ThreadView({ sessionId }: ThreadViewProps) {
  const store = getOrCreateSessionStore(sessionId);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-(--tethys-canvas)">
      <Stage store={store} className="flex-1" />
    </div>
  );
}
