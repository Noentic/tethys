import { getAllInspectorSlots } from "@tethys/ui";

export interface InspectorPaneProps {
  sessionId?: string;
  className?: string;
  isOverlay?: boolean;
  onCloseOverlay?: () => void;
}

export function InspectorPane({
  sessionId,
  className,
  isOverlay = false,
  onCloseOverlay,
}: InspectorPaneProps) {
  const slots = getAllInspectorSlots();

  const content = (
    <aside
      aria-label="Turn Inspector"
      className={`flex h-full w-[360px] flex-col border-l border-(--tethys-hairline) bg-(--tethys-surface-panel) select-none shrink-0 overflow-y-auto ${className ?? ""}`}
    >
      <div className="flex h-10 items-center justify-between border-b border-(--tethys-hairline) px-4">
        <span className="text-xs font-semibold text-(--tethys-text-primary)">
          Inspector
        </span>
        {isOverlay && onCloseOverlay && (
          <button
            type="button"
            onClick={onCloseOverlay}
            aria-label="Close inspector"
            className="flex h-6 w-6 items-center justify-center rounded text-(--tethys-text-muted) hover:text-(--tethys-text-primary)"
          >
            ×
          </button>
        )}
      </div>

      <div className="flex-1 p-4 flex flex-col gap-4">
        {slots.length === 0 ? (
          <div className="py-8 text-center text-xs text-(--tethys-text-muted)">
            No inspector slots registered
          </div>
        ) : (
          slots.map(([id, SlotComponent]) => (
            <div key={id} className="w-full">
              <SlotComponent sessionId={sessionId} />
            </div>
          ))
        )}
      </div>
    </aside>
  );

  if (isOverlay) {
    return (
      <div className="fixed inset-0 z-30 flex justify-end bg-(--tethys-overlay-scrim)">
        {content}
      </div>
    );
  }

  return content;
}
