//! Trusted Folders section (spec §5.1; M1.16 U10; pen `HL2ay` Trusted list).
//! Renders a `trusted-folder-row` per trusted workspace from the live
//! `workspace.list` and revokes via `workspace.remove`. Revoking removes the
//! card from the hub (the trust-filtered list no longer returns it).

import { Trash } from "@nebutra/icons";
import { queryClient, queryKeys, useWorkspaceRows } from "@tethys/state";
import { Button, WorkspaceSourceBadge } from "@tethys/ui";
import { useState } from "react";

export interface TrustedFolderEntry {
  id: string;
  path: string;
  vcs:
    | { kind: "none" }
    | { kind: "git-local" }
    | { kind: "git-remote"; host: "github" | "gitlab" | "other" };
}

export const trustedFolderFixtures: TrustedFolderEntry[] = [
  {
    id: "tethys",
    path: "~/Code/tethys",
    vcs: { kind: "git-remote", host: "github" },
  },
];

export interface TrustedFoldersClient {
  workspace: {
    remove(workspaceId: string): Promise<void>;
  };
}

export interface TrustedFoldersProps {
  /** Test override; the live `workspace.list` is the default source. */
  folders?: TrustedFolderEntry[];
  client?: TrustedFoldersClient;
  onRevoked?: (workspaceId: string) => void;
}

export function TrustedFolders({
  folders,
  client,
  onRevoked,
}: TrustedFoldersProps) {
  const rows = useWorkspaceRows(undefined, folders === undefined);
  const [revoked, setRevoked] = useState<string[]>([]);

  const source: TrustedFolderEntry[] =
    folders ??
    rows.map((row) => ({
      id: row.id,
      path: row.path,
      vcs: row.capabilities.vcs,
    }));
  const items = source.filter((folder) => !revoked.includes(folder.id));

  const revoke = async (workspaceId: string) => {
    await client?.workspace.remove(workspaceId);
    setRevoked((prev) => [...prev, workspaceId]);
    onRevoked?.(workspaceId);
    void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
  };

  if (items.length === 0) {
    return (
      <div className="py-xl text-center text-body-sm text-(--tethys-text-muted)">
        No trusted folders.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {items.map((folder) => (
        <div
          key={folder.id}
          data-testid="trusted-folder-row"
          className="flex h-14 items-center gap-md border-b border-(--tethys-hairline) px-md last:border-b-0"
        >
          <span className="min-w-0 flex-1 truncate text-body-sm text-(--tethys-text-primary)">
            {folder.path}
          </span>
          <WorkspaceSourceBadge vcs={folder.vcs} />
          <Button
            size="sm"
            variant="destructive"
            onClick={() => void revoke(folder.id)}
            className="gap-1.5"
          >
            <Trash className="size-4" />
            <span>Revoke</span>
          </Button>
        </div>
      ))}
    </div>
  );
}
