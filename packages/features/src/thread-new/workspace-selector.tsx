//! `workspace-selector-pill` (DESIGN.md; spec §3) — explicit workspace choice.
//!
//! No thread is created without an explicit `cwd`: the pill is unresolved
//! until a workspace is picked (or a last-active one is pre-filled by the
//! caller). The resolved path shows as a `mono-code` tooltip.

import { type TrustedWorkspace, useTrustedWorkspaces } from "@tethys/state";
import { Listbox, Popover, Tooltip, WorkspaceSourceBadge } from "@tethys/ui";
import { useRef, useState } from "react";

// Pen `XrH5y / Git context pill`: 22px, surface-card, md radius, hairline.
const PILL_CLASS =
  "focus-ring flex h-[22px] items-center gap-1.5 rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-card) px-2 text-label-md text-(--tethys-text-secondary) transition-colors hover:bg-(--tethys-surface-hover) hover:text-(--tethys-text-primary)";

export interface WorkspaceSelectorProps {
  workspaces?: TrustedWorkspace[];
  selected: TrustedWorkspace | null;
  onSelect: (workspace: TrustedWorkspace) => void;
  onClosed?: () => void;
}

export function WorkspaceSelector({
  workspaces: workspacesProp,
  selected,
  onSelect,
  onClosed,
}: WorkspaceSelectorProps) {
  const workspaces = useTrustedWorkspaces(workspacesProp);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    onClosed?.();
  };

  const pill = (
    <button
      ref={anchorRef}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label="Workspace"
      onClick={() => setOpen((prev) => !prev)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setOpen((prev) => !prev);
        } else if (event.key === "Escape") {
          close();
        }
      }}
      className={PILL_CLASS}
    >
      <WorkspaceSourceBadge
        vcs={selected?.vcs ?? { kind: "none" }}
        glyphOnly
        className="pointer-events-none"
      />
      <span
        className={
          selected
            ? "text-(--tethys-text-primary)"
            : "text-(--tethys-text-muted)"
        }
      >
        {selected?.name ?? "Choose a folder"}
      </span>
      <span aria-hidden="true" className="text-(--tethys-text-muted)">
        {"\u25be"}
      </span>
    </button>
  );

  return (
    <div className="relative self-start">
      {selected ? (
        <Tooltip
          content={
            <span className="font-mono text-mono-code">{selected.path}</span>
          }
        >
          {pill}
        </Tooltip>
      ) : (
        pill
      )}

      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        className="top-full left-0 mt-1.5"
      >
        <div className="w-72">
          <div className="px-3 py-1 text-label-sm text-(--tethys-text-muted) uppercase tracking-wider">
            Trusted Workspaces
          </div>
          {workspaces.length === 0 ? (
            <p className="px-3 py-2 text-body-sm text-(--tethys-text-muted)">
              No trusted workspaces yet.
            </p>
          ) : (
            <Listbox
              label="Trusted workspaces"
              selectedId={selected?.id}
              items={workspaces.map((workspace) => ({
                id: workspace.id,
                value: workspace,
                label: workspace.name,
                sublabel: workspace.path,
              }))}
              onSelect={(item) => {
                onSelect(item.value);
                setOpen(false);
              }}
            />
          )}
        </div>
      </Popover>
    </div>
  );
}
