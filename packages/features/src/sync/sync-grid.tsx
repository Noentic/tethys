//! `sync-grid` container (DESIGN.md `sync-grid`; spec §5.4).
//!
//! Rows are MCP servers, columns are Providers. `@tanstack/react-table` supplies
//! the column model and the pinned server column; this component owns the
//! markup, the `position: sticky` styling and the two-dimensional roving focus
//! model (`useGridRoving`). `mcp.attachments` is authoritative — no attachment
//! state is derived here.

import {
  columnPinningFeature,
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type {
  AttachmentGrid,
  AttachmentState,
  ProjectionTarget,
  ProviderColumn,
  ServerRow,
} from "@tethys/bindings";
import { gridDimensions, gridRows } from "@tethys/state";
import { Button, cn, EmptyState, ProtocolPill, StatusDot } from "@tethys/ui";
import type React from "react";
import { useMemo } from "react";
import { AttachmentCell } from "./attachment-cell";
import { useGridRoving } from "./use-grid-roving";

export const FROZEN_COLUMN_WIDTH = 220;
export const MIN_COLUMN_WIDTH = 132;
export const HEADER_HEIGHT = 36;
export const ROW_HEIGHT = 40;

const features = tableFeatures({ columnPinningFeature });
const helper = createColumnHelper<typeof features, GridTableRow>();

interface GridTableRow {
  id: string;
  server: ServerRow;
  states: Record<string, AttachmentState>;
}

const providerColumnId = (providerId: string) => `provider:${providerId}`;

const frozenCellStyle: React.CSSProperties = {
  position: "sticky",
  left: 0,
  width: FROZEN_COLUMN_WIDTH,
  minWidth: FROZEN_COLUMN_WIDTH,
  zIndex: 2,
};
const frozenHeaderStyle: React.CSSProperties = {
  ...frozenCellStyle,
  top: 0,
  zIndex: 3,
};

export interface SyncGridProps {
  grid: AttachmentGrid;
  onSelectServer?: (server: ServerRow) => void;
  onActivateProjection?: (target: ProjectionTarget) => void;
  onAddServer?: () => void;
  className?: string;
}

export function SyncGrid({
  grid,
  onSelectServer,
  onActivateProjection,
  onAddServer,
  className,
}: SyncGridProps) {
  const { rowCount, columnCount } = gridDimensions(grid);
  const rows = useMemo(() => gridRows(grid), [grid]);

  const data = useMemo<GridTableRow[]>(
    () =>
      rows.map((row) => ({
        id: row.server.name,
        server: row.server,
        states: Object.fromEntries(
          row.cells.map((cell) => [cell.provider.id, cell.state]),
        ),
      })),
    [rows],
  );

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor((row) => row.server, {
          id: "server",
          header: "Server",
        }),
        ...grid.providers.map((provider) =>
          helper.accessor((row) => row.states[provider.id], {
            id: providerColumnId(provider.id),
            header: provider.name,
          }),
        ),
      ]),
    [grid.providers],
  );

  const table = useTable({
    features,
    columns,
    data,
    initialState: { columnPinning: { start: ["server"], end: [] } },
  });

  const orderedColumns = useMemo(
    () => [
      ...table.getStartVisibleLeafColumns(),
      ...table.getCenterVisibleLeafColumns(),
    ],
    [table],
  );
  const providerByColumnId = useMemo(
    () => new Map(grid.providers.map((p) => [providerColumnId(p.id), p])),
    [grid.providers],
  );
  const roving = useGridRoving({ rowCount, columnCount });

  return (
    <div className={cn("flex flex-col gap-md", className)}>
      <div
        data-testid="sync-grid-scroll"
        className="overflow-x-auto rounded-md border border-(--tethys-hairline)"
        style={{
          scrollPaddingLeft: FROZEN_COLUMN_WIDTH,
          scrollPaddingTop: HEADER_HEIGHT,
        }}
      >
        {/* biome-ignore lint/a11y/useSemanticElements: DESIGN role=grid on a div region */}
        <div
          role="grid"
          aria-label="MCP server attachments"
          aria-rowcount={rowCount}
          aria-colcount={columnCount}
          className="min-w-max"
          onKeyDown={roving.onKeyDown}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: DESIGN sync-grid renders div rows under role=grid */}
          <div
            role="row"
            tabIndex={-1}
            className="flex border-b border-(--tethys-hairline-strong) bg-(--tethys-surface-elevated)"
            style={{ height: HEADER_HEIGHT, position: "sticky", top: 0 }}
          >
            {/* biome-ignore lint/a11y/useSemanticElements: DESIGN sync-grid frozen server columnheader */}
            <div
              role="columnheader"
              aria-label="Server"
              tabIndex={-1}
              className="flex items-center border-r border-(--tethys-hairline-strong) px-3 text-label-sm text-(--tethys-text-muted)"
              style={frozenHeaderStyle}
            >
              Server
            </div>
            {orderedColumns
              .filter((column) => column.id !== "server")
              .map((column) => {
                const provider = providerByColumnId.get(column.id);
                if (provider === undefined) return null;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: DESIGN sync-grid Provider columnheader
                  <div
                    key={column.id}
                    role="columnheader"
                    tabIndex={-1}
                    className="flex items-center gap-1.5 border-r border-(--tethys-hairline) px-3 text-label-sm text-(--tethys-text-secondary)"
                    style={{
                      position: "sticky",
                      top: 0,
                      width: MIN_COLUMN_WIDTH,
                      minWidth: MIN_COLUMN_WIDTH,
                    }}
                  >
                    <StatusDot
                      status={provider.connected ? "healthy" : "missing"}
                      inline
                    />
                    <span className="truncate">{provider.name}</span>
                    {provider.target && (
                      <ProtocolPill>{provider.target}</ProtocolPill>
                    )}
                  </div>
                );
              })}
          </div>

          {table.getRowModel().rows.map((tableRow, rowIndex) => (
            // biome-ignore lint/a11y/useSemanticElements: DESIGN sync-grid renders div rows under role=grid
            <div
              key={tableRow.id}
              role="row"
              tabIndex={-1}
              className="flex border-b border-(--tethys-hairline) last:border-b-0"
              style={{ height: ROW_HEIGHT }}
            >
              {orderedColumns.map((column) => {
                if (column.id === "server") {
                  const server = tableRow.getValue(
                    "server",
                  ) as unknown as ServerRow;
                  return (
                    <RowHeader
                      key={`${tableRow.id}:server`}
                      server={server}
                      rowIndex={rowIndex}
                      roving={roving}
                      onSelectServer={onSelectServer}
                    />
                  );
                }
                const provider = providerByColumnId.get(column.id);
                if (provider === undefined) return null;
                const col = providerColumnIndex(grid.providers, provider);
                const state = tableRow.getValue(
                  column.id,
                ) as unknown as AttachmentState;
                return (
                  <div
                    key={`${tableRow.id}:${column.id}`}
                    role="presentation"
                    className="border-r border-(--tethys-hairline)"
                    style={{
                      width: MIN_COLUMN_WIDTH,
                      minWidth: MIN_COLUMN_WIDTH,
                    }}
                  >
                    <AttachmentCell
                      serverName={tableRow.original.server.name}
                      providerName={provider.name}
                      state={state}
                      tabIndex={roving.isFocused(rowIndex, col) ? 0 : -1}
                      cellRef={roving.register(rowIndex, col)}
                      onFocus={() => undefined}
                      onActivate={() =>
                        state.kind === "file-projection"
                          ? onActivateProjection?.(state.target)
                          : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {columnCount === 0 ? (
        <EmptyState
          title="No connected Providers"
          description="Attach servers to a Provider from Settings / Providers."
          action={
            <a
              href="/settings/providers"
              className="text-label-md text-(--tethys-accent-focus) hover:underline"
            >
              Open Settings / Providers
            </a>
          }
        />
      ) : rowCount === 0 ? (
        <EmptyState
          title="No MCP servers configured"
          action={
            <Button size="sm" variant="secondary" onClick={onAddServer}>
              Add server
            </Button>
          }
        />
      ) : null}
    </div>
  );
}

function providerColumnIndex(
  providers: ProviderColumn[],
  provider: ProviderColumn,
): number {
  return providers.findIndex((candidate) => candidate.id === provider.id);
}

interface RowHeaderProps {
  server: ServerRow;
  rowIndex: number;
  roving: ReturnType<typeof useGridRoving>;
  onSelectServer?: (server: ServerRow) => void;
}

function RowHeader({
  server,
  rowIndex,
  roving,
  onSelectServer,
}: RowHeaderProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: DESIGN sync-grid server rowheader
    <div
      role="rowheader"
      aria-label={`${server.name}, ${server.transport}, ${server.scope}`}
      tabIndex={roving.isFocused(rowIndex, -1) ? 0 : -1}
      ref={roving.register(rowIndex, -1)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectServer?.(server);
        }
      }}
      onClick={() => onSelectServer?.(server)}
      className="flex cursor-pointer items-center gap-2 border-r border-(--tethys-hairline-strong) bg-(--tethys-surface-elevated) px-3 text-left focus-ring"
      style={frozenCellStyle}
    >
      <span className="truncate font-mono text-mono-code text-(--tethys-text-primary)">
        {server.name}
      </span>
      <ProtocolPill>{server.transport}</ProtocolPill>
      <span className="text-label-sm text-(--tethys-text-muted)">
        {server.scope}
      </span>
    </div>
  );
}
