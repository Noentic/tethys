import { Cross } from "@nebutra/icons";
import { getAllInspectorSlots, IconButton } from "@tethys/ui";

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
      className={`flex h-full flex-col overflow-y-auto border-l border-(--tethys-hairline-structural) bg-(--tethys-surface-panel) select-none ${
        isOverlay ? "w-(--layout-shell-inspector) shrink-0" : "w-full"
      } ${className ?? ""}`}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-(--tethys-hairline) px-lg">
        <span className="text-heading-md text-(--tethys-text-primary)">
          Inspector
        </span>
        {isOverlay && onCloseOverlay && (
          <IconButton
            size="compact"
            label="Close inspector"
            onClick={onCloseOverlay}
            className="text-(--tethys-text-muted)"
          >
            <Cross className="size-3.5" aria-hidden="true" />
          </IconButton>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-lg p-lg">
        {slots.length === 0 ? (
          <div className="py-xl text-center text-body-sm text-(--tethys-text-muted)">
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
      <div className="fixed inset-0 z-(--tethys-z-drawer) flex justify-end bg-(--tethys-overlay-scrim)">
        {content}
      </div>
    );
  }

  return content;
}
