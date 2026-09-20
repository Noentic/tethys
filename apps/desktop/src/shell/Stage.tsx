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
      <div className="flex min-w-[560px] flex-1 items-center justify-center p-2xl">
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
      className={`min-w-[560px] flex-1 overflow-y-auto ${className ?? ""}`}
    >
      <div className="mx-auto flex w-full max-w-(--layout-stage-measure) flex-col gap-md px-xl py-xl">
        {entries.map((entry) => {
          const Renderer = getEntryRenderer(entry.kind);
          return (
            <div key={entry.id} className="w-full">
              <Renderer entry={entry} />
            </div>
          );
        })}
      </div>
    </main>
  );
}
