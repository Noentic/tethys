//! `workspace-trust-dialog` (DESIGN.md; spec §2.1). A focus-trapped modal
//! (extends `modal-dialog`, 480px) with source-branched body copy, the
//! permission-mode radio group, the scope checkbox, and the optional in-place
//! git init. Confirming calls `workspace.add` (the one path-taking method).

import type { PermissionMode, TrustGrant, Vcs } from "@tethys/bindings";
import { PERMISSION_MODE_LABELS } from "@tethys/state";
import { Badge, Button, ModalDialog, WorkspaceSourceBadge } from "@tethys/ui";
import { useEffect, useState } from "react";

export interface WorkspaceTrustDialogProps {
  open: boolean;
  path?: string | null;
  vcs?: Vcs | null;
  onClose: () => void;
  onConfirm: (request: TrustGrant) => void | Promise<void>;
}

const MODES: PermissionMode[] = ["supervised", "auto-edit", "yolo"];

function shortPath(path: string): string {
  return path.replace(/^\/(?:home|Users)\/[^/]+/, "~");
}

export function WorkspaceTrustDialog({
  open,
  path,
  vcs = null,
  onClose,
  onConfirm,
}: WorkspaceTrustDialogProps) {
  const [mode, setMode] = useState<PermissionMode>("supervised");
  const [subtree, setSubtree] = useState(false);
  const [initGit, setInitGit] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the target folder changes
  useEffect(() => {
    if (open) {
      setMode("supervised");
      setSubtree(false);
      setInitGit(false);
    }
  }, [open, path]);

  const resolved = Boolean(path);
  const kind = vcs?.kind ?? "none";

  const confirm = () => {
    if (!path) return;
    void onConfirm({
      path,
      permission_mode: mode,
      scope: subtree ? "subtree" : "folder",
      init_git: kind === "none" && initGit,
    });
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Trust this workspace folder?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!resolved} onClick={confirm}>
            Trust &amp; Add Workspace
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-lg text-body-sm text-(--tethys-text-secondary)">
        <div className="flex items-center justify-between gap-sm">
          {vcs ? (
            <WorkspaceSourceBadge vcs={vcs} />
          ) : (
            <Badge variant="muted">Resolving…</Badge>
          )}
          <span className="truncate font-mono text-mono-code text-(--tethys-text-primary)">
            {path ? shortPath(path) : "No folder selected"}
          </span>
        </div>

        {kind === "none" && (
          <div data-testid="trust-copy-none" className="flex flex-col gap-sm">
            <p>
              This folder is not a git repository. Tethys runs a single session
              here and cannot create isolated worktrees.
            </p>
            <label className="flex items-center gap-sm">
              <input
                type="checkbox"
                checked={initGit}
                onChange={(event) => setInitGit(event.target.checked)}
              />
              <span>Initialize git now</span>
            </label>
          </div>
        )}

        {kind === "git-local" && (
          <p data-testid="trust-copy-local-git">
            This is a local git repository. Tethys creates an isolated worktree
            per thread so parallel agents cannot collide.
          </p>
        )}

        {kind === "git-remote" && (
          <p
            data-testid="trust-copy-remote"
            className="rounded-md border border-warning-soft bg-(--tethys-status-warning-soft) p-md text-(--tethys-status-warning)"
          >
            This folder has a remote. Tethys reads the remote URL for the source
            badge only; it never fetches, pushes, or authenticates on its own.
          </p>
        )}

        <fieldset className="flex flex-col gap-sm border-0 p-0">
          <legend className="mb-1 text-label-md text-(--tethys-text-primary)">
            Permission mode
          </legend>
          <div
            role="radiogroup"
            aria-label="Permission mode"
            className="flex flex-col gap-1.5"
          >
            {MODES.map((value) => (
              <label key={value} className="flex items-center gap-sm">
                <input
                  type="radio"
                  name="trust-permission-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                <span>{PERMISSION_MODE_LABELS[value]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-sm">
          <input
            type="checkbox"
            checked={subtree}
            onChange={(event) => setSubtree(event.target.checked)}
          />
          <span>Also trust subfolders (subtree)</span>
        </label>
      </div>
    </ModalDialog>
  );
}
