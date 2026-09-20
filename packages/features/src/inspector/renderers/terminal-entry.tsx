import type { TerminalEntry } from "@tethys/state";
import { TerminalView } from "@tethys/terminal";
import { cn } from "@tethys/ui";

/** Wraps the read-only terminal surface for a terminal entry. */
export function TerminalEntryRenderer({
  entry,
  className,
}: {
  entry: TerminalEntry;
  className?: string;
}) {
  return (
    <div data-entry-kind="terminal" className={cn("my-sm", className)}>
      <TerminalView
        output={entry.output}
        title={`Terminal ${entry.terminalId}`}
      />
    </div>
  );
}
