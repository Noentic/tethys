import { ChevronLeft, ChevronRight, Cross } from "@nebutra/icons";
import {
  getAllInspectorSlots,
  IconButton,
  StateBadge,
  StatusDot,
} from "@tethys/ui";

export interface InspectorPaneProps {
  sessionId?: string;
  /** The session's live state; drives the header badge. */
  status?: string;
  className?: string;
  isOverlay?: boolean;
  onCloseOverlay?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/**
 * The docked Inspector shell region (DESIGN.md `thread-inspector`). The header
 * names the session's live state so collapsing can never hide *that* a request
 * is pending; the collapsed rail keeps the breathing marker visible for the same
 * reason (State Precedence rule 5).
 */
export function InspectorPane({
  sessionId,
  status = "idle",
  className,
  isOverlay = false,
  onCloseOverlay,
  collapsed = false,
  onToggleCollapse,
}: InspectorPaneProps) {
  const slots = getAllInspectorSlots();

  if (collapsed && !isOverlay) {
    return (
      <aside
        aria-label="Thread Inspector"
        data-testid="inspector-rail"
        className={`flex h-full w-full flex-col items-center gap-md border-l border-(--tethys-hairline-structural) bg-(--tethys-surface-panel) py-md ${
          className ?? ""
        }`}
      >
        <StatusDot status={status} />
        <IconButton
          size="compact"
          label="Expand inspector"
          aria-expanded={false}
          onClick={onToggleCollapse}
          className="text-(--tethys-text-muted)"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
        </IconButton>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Thread Inspector"
      data-testid="inspector-pane-shell"
      className={`flex h-full w-full flex-col overflow-y-auto bg-(--tethys-surface-panel) p-lg select-none ${
        isOverlay ? "" : "border-l border-(--tethys-hairline-structural)"
      } ${className ?? ""}`}
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-sm px-1">
        <div className="flex min-w-0 items-center gap-sm">
          <span className="truncate text-heading-md text-(--tethys-text-primary)">
            Thread Inspector
          </span>
          <StateBadge status={status} />
        </div>
        {isOverlay && onCloseOverlay ? (
          <IconButton
            size="compact"
            label="Close inspector"
            onClick={onCloseOverlay}
            className="text-(--tethys-text-muted)"
          >
            <Cross className="size-3.5" aria-hidden="true" />
          </IconButton>
        ) : (
          <button
            type="button"
            aria-expanded={true}
            aria-controls="thread-inspector-content"
            onClick={onToggleCollapse}
            className="focus-ring inline-flex h-7 shrink-0 items-center gap-1 rounded-sm px-2 text-label-md text-(--tethys-text-muted) hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-secondary)"
          >
            Collapse
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div
        id="thread-inspector-content"
        className="flex flex-1 flex-col gap-[14px]"
      >
        {slots.length === 0 ? (
          <div className="py-xl text-center text-body-sm text-(--tethys-text-muted)">
            No inspector slots registered
          </div>
        ) : (
          slots.map(([id, SlotComponent]) => (
            <SlotComponent key={id} sessionId={sessionId} />
          ))
        )}
      </div>
    </aside>
  );
}
