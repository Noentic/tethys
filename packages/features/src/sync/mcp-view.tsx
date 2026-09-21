//! Settings / MCP (pen `JfRw1`): scope and provider pickers, the provider's
//! config file, a read-only view of its projected content, the injection note
//! and the Add-server dialog. Below that the existing attachment surface stays
//! as-is — the `sync-grid` matrix, the server config card, the vendor-file
//! fallback (which owns the only Apply/Rollback controls) and the import wizard.

import type {
  AttachmentGrid,
  ProjectionPlan,
  ProjectionTarget,
  RegistryEntry,
  RegistryEntryView,
  Scope,
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
import {
  Badge,
  Button,
  cn,
  PageHeader,
  SegmentedControl,
  Select,
} from "@tethys/ui";
import { useCallback, useEffect, useState } from "react";
import { ProviderGlyph } from "../workspaces/session-item-chip";
import { McpImportWizard } from "./import-wizard";
import { McpAddServerForm } from "./mcp-add-server-form";
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
  const [addOpen, setAddOpen] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [configScope, setConfigScope] = useState<Scope>("workspace");
  const [plan, setPlan] = useState<ProjectionPlan | null>(null);

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

  const activeProvider =
    grid?.providers.find((provider) => provider.id === activeProviderId) ??
    grid?.providers[0] ??
    null;
  const target = activeProvider?.target ?? null;

  useEffect(() => {
    if (!workspaceId || target === null) {
      setPlan(null);
      return;
    }
    let live = true;
    void client.mcp
      .projection_plan(workspaceId, target, configScope)
      .then((next) => {
        if (live) setPlan(next);
      })
      .catch(() => {
        // A provider whose file cannot be read yet simply shows no well; the
        // attachment surface below still reports its real state.
        if (live) setPlan(null);
      });
    return () => {
      live = false;
    };
  }, [client, workspaceId, target, configScope]);

  const attached = grid ? countAttachedCells(grid) : 0;
  const selectedEntry = selectedServer
    ? (registry.find((entry) => entry.name === selectedServer.name) ?? null)
    : null;

  const addServer = async (name: string, entry: RegistryEntry) => {
    await client.mcp.registry_set(name, entry, configScope, workspaceId);
    await refresh();
  };

  return (
    <div className={className ?? "flex flex-col gap-xl"}>
      <PageHeader
        breadcrumb="Settings / MCP Servers"
        title="MCP servers"
        description="Each Provider reads its own config file. Pick a scope and a Provider, then add the servers it should see."
      />

      <div className="flex h-8 items-center gap-md">
        <SegmentedControl
          size="sm"
          value={configScope}
          onChange={setConfigScope}
          options={[
            { value: "global", label: "Global" },
            { value: "workspace", label: "Workspace" },
          ]}
        />
        <div className="w-[220px] shrink-0">
          <Select
            aria-label="Workspace"
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
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => void refresh()}>
          Recheck
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!workspaceId}
          onClick={() => setAddOpen(true)}
        >
          Add server
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-body-sm text-(--tethys-status-danger)">
          {error}
        </p>
      )}

      {grid && grid.providers.length > 0 && (
        <div
          data-testid="mcp-provider-tabs"
          role="tablist"
          aria-label="Provider"
          className="flex h-8 items-center gap-2"
        >
          {grid.providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              role="tab"
              aria-selected={activeProvider?.id === provider.id}
              onClick={() => setActiveProviderId(provider.id)}
              className={cn(
                "focus-ring flex h-7 items-center gap-2 rounded-sm px-3 text-label-md",
                activeProvider?.id === provider.id
                  ? "bg-(--tethys-surface-active) text-(--tethys-text-primary)"
                  : "text-(--tethys-text-secondary) hover:bg-(--tethys-surface-hover)",
                !provider.connected && "opacity-60",
              )}
            >
              <ProviderGlyph providerId={provider.id} />
              {provider.name}
            </button>
          ))}
        </div>
      )}

      {activeProvider && (
        <div className="flex flex-col gap-sm">
          <div
            data-testid="mcp-config-file"
            className="flex h-[34px] items-center gap-2 text-label-sm"
          >
            <span className="text-(--tethys-text-muted)">Config file</span>
            <span className="truncate font-mono text-mono-micro text-(--tethys-text-secondary)">
              {plan?.path ??
                (target
                  ? "Reading the Provider's config file…"
                  : "No vendor file — this Provider receives servers over ACP")}
            </span>
            <span className="ml-auto flex items-center gap-2">
              <Badge variant="muted" size="sm">
                {configScope}
              </Badge>
            </span>
          </div>

          <div
            data-testid="mcp-editor-well"
            className="h-[414px] overflow-auto rounded-md border border-(--tethys-hairline-on-sunken) bg-(--tethys-surface-sunken) p-md"
          >
            {plan ? (
              <pre className="font-mono text-mono-micro text-(--tethys-text-on-sunken-secondary)">
                {plan.content}
              </pre>
            ) : (
              <p className="text-body-sm text-(--tethys-text-muted)">
                {target
                  ? "The Provider's config file has no projected entries yet."
                  : "This Provider is attached over ACP at session start; there is no file to show."}
              </p>
            )}
          </div>

          <p className="flex items-center gap-2 text-label-sm text-(--tethys-text-muted)">
            <span aria-hidden="true">ⓘ</span>
            Attached to new {activeProvider.name} sessions at session start.
            {target
              ? ` Entries here are written to ${activeProvider.name}'s own config file.`
              : " Entries here are handed to the Provider over ACP."}
          </p>
        </div>
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
            onAddServer={() => setAddOpen(true)}
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

      <McpAddServerForm
        open={addOpen}
        context={
          activeProvider ? `${activeProvider.name} · ${configScope}` : undefined
        }
        onClose={() => setAddOpen(false)}
        onSave={addServer}
      />

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
