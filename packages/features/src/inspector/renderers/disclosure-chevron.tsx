//! The disclosure chevron shared by every collapsible transcript row, so a
//! tool call, a run, a thought, and a subagent open the same way.

import { ChevronRight } from "@nebutra/icons";
import { cn } from "@tethys/ui";

/** The disclosure chevron: points right when collapsed, down when open. */
export function DisclosureChevron({
  expanded,
  className,
}: {
  expanded: boolean;
  className?: string;
}) {
  return (
    <ChevronRight
      aria-hidden="true"
      className={cn(
        "size-3.5 shrink-0 transition-transform duration-150",
        expanded && "rotate-90",
        className,
      )}
    />
  );
}
