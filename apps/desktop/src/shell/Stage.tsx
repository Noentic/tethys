import { useStore } from "@tanstack/react-store";
import type { SessionStore } from "@tethys/state";
import { EmptyState, getEntryRenderer } from "@tethys/ui";

export interface StageProps {
  store: SessionStore;
  className?: string;
}

export function Stage({ store, className }: StageProps) {
  const entries = useStore(store, (state) => state.entries);

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center min-w-[560px] p-8">
        <EmptyState
          title="No activity yet"
          description="Send a message in the composer or select an action to start this thread."
        />
      </div>
    );
  }

  return (
    <main
      aria-label="Thread Stage"
      className={`flex-1 overflow-y-auto min-w-[560px] p-4 flex flex-col gap-3 ${className ?? ""}`}
    >
      {entries.map((entry) => {
        const Renderer = getEntryRenderer(entry.kind);
        return (
          <div key={entry.id} className="w-full">
            <Renderer entry={entry} />
          </div>
        );
      })}
    </main>
  );
}
