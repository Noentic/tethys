import type { DiffFile } from "@tethys/bindings";
import { Button, cn } from "@tethys/ui";

export interface FileHeaderProps {
  file: DiffFile;
  staged: boolean;
  expanded: boolean;
  onToggleStage: () => void;
  onToggleExpanded: () => void;
  onDiscardFile: () => void;
  className?: string;
}

const STATUS_LABELS: Record<DiffFile["status"], string> = {
  Added: "added",
  Modified: "modified",
  Deleted: "deleted",
  Renamed: "renamed",
  Copied: "copied",
  TypeChanged: "type changed",
  Unmerged: "unmerged",
  Other: "changed",
};

/**
 * One file row in the review list. Stage is a path-level toggle here — the
 * engine's `git.stage` takes paths — while discard is hunk-granular elsewhere,
 * so the two never share a control (M1.9 Key Decision).
 */
export function FileHeader({
  file,
  staged,
  expanded,
  onToggleStage,
  onToggleExpanded,
  onDiscardFile,
  className,
}: FileHeaderProps) {
  return (
    <div
      data-testid="file-header"
      data-path={file.path}
      className={cn(
        "flex items-center gap-2 rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-panel) px-2 py-1",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggleExpanded}
        className="focus-ring flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="truncate font-mono text-mono-code text-(--tethys-text-primary)">
          {file.path}
        </span>
        <span className="shrink-0 text-label-sm text-(--tethys-text-muted)">
          {STATUS_LABELS[file.status]}
        </span>
      </button>

      <span className="shrink-0 font-mono text-mono-micro">
        <span className="text-diff-added">+{file.additions}</span>{" "}
        <span className="text-diff-removed">−{file.deletions}</span>
      </span>

      <Button
        size="sm"
        variant={staged ? "primary" : "secondary"}
        aria-pressed={staged}
        onClick={onToggleStage}
      >
        {staged ? "Staged" : "Stage"}
      </Button>

      <Button size="sm" variant="destructive" onClick={onDiscardFile}>
        Discard file
      </Button>
    </div>
  );
}
