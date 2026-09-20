//! Settings / MCP page shell (M1.11 U2): workspace scope selector, the
//! `sync-grid` matrix, the Server Configuration Card, the vendor-file fallback
//! section and the import wizard.

import type {
  AttachmentGrid,
  ProjectionTarget,
  RegistryEntryView,
  ServerRow,
} from "@tethys/bindings";
import { createClient } from "@tethys/client";
import {
  countAttachedCells,
  hasFallbackProjection,
  type McpSyncClient,
  type McpWorkspaceScope,
  useMcpWorkspaceScope,
} from "@tethys/state";
import { Button, PageHeader, Select } from "@tethys/ui";
import { useCallback, useEffect, useState } from "react";
import { McpImportWizard } from "./import-wizard";
import { ProjectionFallback } from "./projection-fallback";
import { ServerConfigCard } from "./server-config-card";
import { SyncGrid } from "./sync-grid";

const defaultClient = createClient();

export interface McpViewProps {
  client?: McpSyncClient;
  scope?: McpWorkspaceScope;
  className?: string;
}

export function McpView({
  client = defaultClient,
  scope,
  className,
}: McpViewProps) {
  const defaultScope = useMcpWorkspaceScope();
  const activeScope = scope ?? defaultScope;
  const { workspaceId, workspaces, selectWorkspace } = activeScope;

  const [grid, setGrid] = useState<AttachmentGrid | null>(null);
  const [registry, setRegistry] = useState<RegistryEntryView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<ServerRow | null>(null);
  const [fallbackTarget, setFallbackTarget] = useState<ProjectionTarget | null>(
    null,
  );
  const [importOpen, setImportOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextGrid, nextRegistry] = await Promise.all([
        client.mcp.attachments(workspaceId),
        client.mcp.registry_list(workspaceId),
      ]);
      setGrid(nextGrid);
      setRegistry(nextRegistry);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }, [client, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const attached = grid ? countAttachedCells(grid) : 0;
  const selectedEntry = selectedServer
    ? (registry.find((entry) => entry.name === selectedServer.name) ?? null)
    : null;

  return (
    <div className={className ?? "flex flex-col gap-xl"}>
      <PageHeader
        title="MCP Servers"
        description="Attach Model Context Protocol servers to sessions; the workspace is the scope."
        actions={
          <>
            <Select
              aria-label="Workspace scope"
              value={workspaceId}
              disabled={workspaces.length === 0}
              onChange={(event) => selectWorkspace(event.target.value)}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setImportOpen(true)}
              disabled={!workspaceId}
            >
              Import
            </Button>
          </>
        }
      />

      {error && (
        <p role="alert" className="text-body-sm text-(--tethys-status-danger)">
          {error}
        </p>
      )}

      {loading && grid === null ? (
        <p className="text-body-sm text-(--tethys-text-muted)">
          Loading attachment grid…
        </p>
      ) : grid ? (
        <>
          <SyncGrid
            grid={grid}
            onSelectServer={setSelectedServer}
            onActivateProjection={setFallbackTarget}
            onAddServer={() => setImportOpen(true)}
          />
          <p className="text-label-sm text-(--tethys-text-muted)">
            {attached} cell{attached === 1 ? "" : "s"} attached · attachment
            takes effect at the next session start; no file is written.
          </p>
          {selectedEntry && (
            <ServerConfigCard
              view={selectedEntry}
              onClose={() => setSelectedServer(null)}
            />
          )}
          {hasFallbackProjection(grid) && (
            <ProjectionFallback
              client={client}
              workspaceId={workspaceId}
              grid={grid}
              activeTarget={fallbackTarget}
              onChanged={() => void refresh()}
            />
          )}
        </>
      ) : null}

      <McpImportWizard
        open={importOpen}
        client={client}
        workspaceId={workspaceId}
        onClose={() => setImportOpen(false)}
        onImported={() => void refresh()}
      />
    </div>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
