//! `isolation-toggle` (DESIGN.md) — where a new thread's edits land: the
//! workspace's current checkout, or a fresh git worktree of its own.

import { BranchPlus, GitBranch } from "@nebutra/icons";
import { cn } from "@tethys/ui";
import type React from "react";

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

const SEGMENTS: Array<{
  worktree: boolean;
  label: string;
  Icon: IconComponent;
}> = [
  { worktree: false, label: "Current checkout", Icon: GitBranch },
  { worktree: true, label: "New worktree", Icon: BranchPlus },
];

export function IsolationToggle({
  worktree,
  onChange,
}: {
  worktree: boolean;
  onChange: (worktree: boolean) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Thread isolation"
      className="inline-flex h-7 items-center rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-card) p-0.5"
    >
      {SEGMENTS.map(({ worktree: value, label, Icon }) => {
        const selected = value === worktree;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a segmented control, not a native radio input
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(value)}
            className={cn(
              "focus-ring inline-flex h-full items-center gap-1.5 rounded-sm px-2 text-label-md transition-colors",
              selected
                ? "bg-(--tethys-surface-active) text-(--tethys-text-primary)"
                : "text-(--tethys-text-muted) hover:text-(--tethys-text-primary)",
            )}
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
