//! `branch-worktree-pill.worktree` (DESIGN.md): the joined `from [base] →
//! [branch]` field group shown when a thread starts on a new worktree. The
//! fields share the row's width instead of holding fixed widths, so a long
//! branch name or a larger type size never pushes the group out of the card.

import { ArrowRight } from "@nebutra/icons";

export interface WorktreeFieldsProps {
  base: string;
  branch: string;
  branchPlaceholder: string;
  onBaseChange: (base: string) => void;
  onBranchChange: (branch: string) => void;
}

const FIELD_CLASS =
  "min-w-0 border-l border-(--tethys-hairline) bg-transparent px-2 text-(--tethys-text-primary) outline-none placeholder:text-(--tethys-text-muted) focus:bg-(--tethys-surface-hover)";

export function WorktreeFields({
  base,
  branch,
  branchPlaceholder,
  onBaseChange,
  onBranchChange,
}: WorktreeFieldsProps) {
  return (
    <div className="inline-flex min-h-7 max-w-full min-w-0 flex-1 basis-64 items-stretch overflow-hidden rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-card) font-mono text-mono-micro">
      <span className="flex shrink-0 items-center px-2 text-(--tethys-text-muted)">
        from
      </span>
      <input
        aria-label="Worktree base"
        value={base}
        size={Math.max(base.length, 4)}
        onChange={(event) => onBaseChange(event.target.value)}
        className={`${FIELD_CLASS} max-w-32 shrink`}
      />
      <span
        aria-hidden="true"
        className="flex shrink-0 items-center border-l border-(--tethys-hairline) px-1.5 text-(--tethys-text-muted)"
      >
        <ArrowRight className="size-3" />
      </span>
      <input
        aria-label="Worktree branch"
        value={branch}
        placeholder={branchPlaceholder}
        onChange={(event) => onBranchChange(event.target.value)}
        className={`${FIELD_CLASS} flex-1`}
      />
    </div>
  );
}
