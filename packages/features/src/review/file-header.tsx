import type { DiffFile } from "@tethys/bindings";
import { Button, cn, TruncatedText } from "@tethys/ui";

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
        "@container flex min-w-0 items-center gap-2 rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-panel) px-2 py-1",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggleExpanded}
        className="focus-ring flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <TruncatedText
          mode="path"
          text={file.path}
          className="font-mono text-mono-code text-(--tethys-text-primary)"
        />
        <span className="hidden shrink-0 text-label-sm text-(--tethys-text-muted) @sm:inline">
          {STATUS_LABELS[file.status]}
        </span>
      </button>

      <span className="shrink-0 font-mono text-mono-micro whitespace-nowrap">
        <span className="text-diff-added">+{file.additions}</span>{" "}
        <span className="text-diff-removed">−{file.deletions}</span>
      </span>

      <Button
        size="sm"
        className="shrink-0"
        variant={staged ? "primary" : "secondary"}
        aria-pressed={staged}
        onClick={onToggleStage}
      >
        {staged ? "Staged" : "Stage"}
      </Button>

      <Button
        size="sm"
        variant="ghost"
        aria-label="Discard file"
        title="Discard every change to this file"
        onClick={onDiscardFile}
        className="shrink-0 text-(--tethys-status-danger)"
      >
        <span className="@md:hidden">Discard</span>
        <span className="hidden @md:inline">Discard file</span>
      </Button>
    </div>
  );
}
