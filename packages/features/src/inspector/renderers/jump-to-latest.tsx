import { cn } from "@tethys/ui";

/**
 * A floating pill at the stage's bottom centre, shown when the user has
 * scrolled away from the tail (DESIGN.md `jump-to-latest`). A pending request
 * that is out of view adds a warning dot.
 */
export function JumpToLatest({
  visible,
  newCount,
  hasPending,
  onJump,
  className,
}: {
  visible: boolean;
  newCount: number;
  hasPending?: boolean;
  onJump: () => void;
  className?: string;
}) {
  if (!visible) {
    return null;
  }
  return (
    <button
      type="button"
      data-testid="jump-to-latest"
      onClick={onJump}
      className={cn(
        "absolute bottom-4 left-1/2 z-(--tethys-z-popover) flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full border border-(--tethys-hairline-strong) bg-(--tethys-surface-overlay) px-3 text-label-sm text-(--tethys-text-secondary)",
        className,
      )}
    >
      ↓ {newCount > 0 ? `${newCount} new` : "Jump to latest"}
      {hasPending && (
        <span
          data-testid="jump-warning-dot"
          role="status"
          aria-label="A request is waiting"
          className="h-1.5 w-1.5 rounded-full border border-(--tethys-status-warning)"
        />
      )}
    </button>
  );
}
