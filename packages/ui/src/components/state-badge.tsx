import { cn } from "../lib/utils";
import { getSessionStateInfo } from "../session-state";
import { StatusDot } from "./status-dot";

export interface StateBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

/**
 * The labelled form of `status-dot` (DESIGN.md state-badge): the marker plus the
 * state name, both in the state's own token so the badge carries the state
 * rather than decorating it. The quiet states keep their label in `text-muted`
 * (`labelColorVar`), since their markers are below text contrast by design. Geometry follows `approval-inbox-pill` minus the
 * count. Used by the `thread-inspector` header, the active tab and the session
 * list row.
 */
export function StateBadge({ status, label, className }: StateBadgeProps) {
  const info = getSessionStateInfo(status);

  return (
    <span
      data-testid="state-badge"
      data-state={status}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full bg-(--tethys-surface-hover) px-2",
        className,
      )}
    >
      <StatusDot status={status} inline />
      <span
        className="text-label-md"
        style={{ color: info.labelColorVar ?? info.colorVar }}
      >
        {label ?? info.label}
      </span>
    </span>
  );
}
