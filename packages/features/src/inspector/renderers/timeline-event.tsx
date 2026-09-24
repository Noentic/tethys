import { detailFromTexts, FileDiffCard } from "@tethys/diff";
import type { CheckpointEntry, FileWriteEntry } from "@tethys/state";
import { cn } from "@tethys/ui";

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
    const detail = detailFromTexts(entry.path, entry.before ?? "", entry.after);
    const verb = entry.before === null ? "Created" : "Changed";
    const source = entry.via === "AcpFs" ? "ACP" : "watcher";
    return (
      <div
        data-entry-kind="file_write"
        className={cn("w-full min-w-0", className)}
        title={`${verb} through ${source}`}
      >
        {detail ? (
          <FileDiffCard detail={detail} verb={verb} />
        ) : (
          <p className="text-label-sm text-(--tethys-text-muted)">
            {verb} <span className="font-mono">{entry.path}</span> · no line
            changes
          </p>
        )}
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
