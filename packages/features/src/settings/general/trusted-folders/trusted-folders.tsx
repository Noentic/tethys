//! Trusted Folders section (spec §5.1; M1.16 U10). Extracted from
//! `settings.general.tsx`; renders `trusted-folder-row`s from the trust store
//! and revokes via `workspace.remove`. Revoking removes the card from the hub
//! (the trust-filtered `workspace.list` no longer returns it).

import type { PermissionMode, Vcs } from "@tethys/bindings";
import { createClient } from "@tethys/client";
import { PERMISSION_MODE_LABELS } from "@tethys/state";
import { Button, WorkspaceSourceBadge } from "@tethys/ui";
import { useState } from "react";

export interface TrustedFolderEntry {
  id: string;
  path: string;
  vcs: Vcs;
  permissionMode: PermissionMode;
  trustedAt: string;
}

export const trustedFolderFixtures: TrustedFolderEntry[] = [
  {
    id: "tethys",
    path: "~/Code/tethys",
    vcs: { kind: "git-remote", host: "github" },
    permissionMode: "supervised",
    trustedAt: "2026-09-17",
  },
];

export interface TrustedFoldersClient {
  workspace: {
    remove(workspaceId: string): Promise<void>;
  };
}

const defaultClient = createClient();

export interface TrustedFoldersProps {
  folders?: TrustedFolderEntry[];
  client?: TrustedFoldersClient;
  onRevoked?: (workspaceId: string) => void;
}

export function TrustedFolders({
  folders = trustedFolderFixtures,
  client = defaultClient,
  onRevoked,
}: TrustedFoldersProps) {
  const [items, setItems] = useState<TrustedFolderEntry[]>(folders);

  const revoke = async (workspaceId: string) => {
    await client.workspace.remove(workspaceId);
    setItems((prev) => prev.filter((folder) => folder.id !== workspaceId));
    onRevoked?.(workspaceId);
  };

  if (items.length === 0) {
    return (
      <div className="px-lg py-xl text-center text-body-sm text-(--tethys-text-muted)">
        No trusted folders.
      </div>
    );
  }

  return (
    <>
      {items.map((folder) => (
        <div
          key={folder.id}
          data-testid="trusted-folder-row"
          className="flex items-center justify-between gap-xl px-lg py-md"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-sm">
              <span className="truncate font-mono text-mono-code text-(--tethys-text-primary)">
                {folder.path}
              </span>
              <WorkspaceSourceBadge vcs={folder.vcs} />
            </div>
            <span className="text-label-md font-normal text-(--tethys-text-muted)">
              Policy: {PERMISSION_MODE_LABELS[folder.permissionMode]} · Trusted{" "}
              {folder.trustedAt}
            </span>
          </div>

          <Button
            size="sm"
            variant="destructive"
            onClick={() => void revoke(folder.id)}
          >
            Revoke Trust
          </Button>
        </div>
      ))}
    </>
  );
}
