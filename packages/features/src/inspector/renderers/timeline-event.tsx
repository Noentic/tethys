import type { CheckpointEntry, FileWriteEntry } from "@tethys/state";
import { cn } from "@tethys/ui";
import { diffForFileWrite, InlineFileDiff } from "./file-diff";

function checkpointLabel(kind: CheckpointEntry["checkpointKind"]): string {
  if (kind === "TurnStart") return "turn start";
  if (kind === "TurnEnd") return "turn end";
  return "manual";
}

/** Renders ACP filesystem and checkpoint events in the transcript timeline. */
export function TimelineEventRenderer({
  entry,
  className,
}: {
  entry: FileWriteEntry | CheckpointEntry;
  className?: string;
}) {
  if (entry.kind === "file_write") {
    return (
      <div
        data-entry-kind="file_write"
        className={cn(
          "w-full rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-nested)",
          className,
        )}
      >
        <div className="flex items-center gap-sm px-md py-sm text-label-sm text-(--tethys-text-muted)">
          <span aria-hidden="true">✎</span>
          <span>Changed</span>
          <span className="font-mono text-mono-micro text-(--tethys-text-secondary)">
            {entry.path}
          </span>
          <span>· {entry.via === "AcpFs" ? "ACP" : "watcher"}</span>
        </div>
        <div className="border-t border-(--tethys-hairline) p-sm">
          <InlineFileDiff diff={diffForFileWrite(entry)} showPath={false} />
        </div>
      </div>
    );
  }

  return (
    <div
      data-entry-kind="checkpoint"
      className={cn(
        "flex items-center gap-sm text-label-sm text-(--tethys-text-muted)",
        className,
      )}
    >
      <span aria-hidden="true">●</span>
      <span>Checkpoint</span>
      <span>· {checkpointLabel(entry.checkpointKind)}</span>
    </div>
  );
}
