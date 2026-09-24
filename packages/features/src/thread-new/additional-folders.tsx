//! The New Thread where band's `Folder` pill: more trusted folders the thread
//! may read and write beside its workspace (spec §3, additional roots).

import { FolderPlus } from "@nebutra/icons";
import type { TrustedWorkspace } from "@tethys/state";
import { Chip, Listbox, Popover, TruncatedText } from "@tethys/ui";
import { useRef, useState } from "react";

// Pen `XrH5y / additional-folder pill`: matches the workspace pill.
export const WHERE_PILL_CLASS =
  "focus-ring flex min-h-7 items-center gap-1.5 rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-card) px-2.5 text-label-md text-(--tethys-text-muted) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)";

export interface AdditionalFoldersProps {
  /** Trusted folders that are neither the workspace nor already added. */
  candidates: TrustedWorkspace[];
  roots: TrustedWorkspace[];
  onChange: (roots: TrustedWorkspace[]) => void;
}

export function AdditionalFolders({
  candidates,
  roots,
  onChange,
}: AdditionalFoldersProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative flex min-w-0 flex-wrap items-center gap-xs">
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Additional folders"
        onClick={() => setOpen((previous) => !previous)}
        className={WHERE_PILL_CLASS}
      >
        <FolderPlus aria-hidden="true" className="size-3.5" />
        Folder
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef}>
        <div className="w-[min(360px,calc(100vw-16px))]">
          <div className="px-3 py-1 text-label-sm text-(--tethys-text-muted) uppercase tracking-wider">
            Additional Trusted Folders
          </div>
          {candidates.length === 0 ? (
            <p className="px-3 py-2 text-body-sm text-(--tethys-text-muted)">
              No further trusted folders.
            </p>
          ) : (
            <Listbox
              label="Additional trusted folders"
              sublabelPlacement="below"
              items={candidates.map((candidate) => ({
                id: candidate.id,
                value: candidate,
                label: candidate.name,
                sublabel: <TruncatedText mode="path" text={candidate.path} />,
              }))}
              onSelect={(item) => {
                onChange([...roots, item.value]);
                setOpen(false);
              }}
            />
          )}
        </div>
      </Popover>
      {roots.map((root) => (
        <Chip
          key={root.id}
          onRemove={() =>
            onChange(roots.filter((candidate) => candidate.id !== root.id))
          }
        >
          <TruncatedText text={root.name} className="max-w-40" />
        </Chip>
      ))}
    </div>
  );
}
