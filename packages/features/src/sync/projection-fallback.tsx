//! Vendor-file fallback projection flow (spec §5.4; SYN-03).
//!
//! Structurally separate from attachment: rendered only when a `FileProjection`
//! cell exists, under its own header, with the only Apply/Rollback controls in
//! the whole surface. Attachment takes effect at the next `session/new` and has
//! no apply step.

import type {
  AttachmentGrid,
  ProjectionPlan,
  ProjectionTarget,
  Scope,
  TargetId,
  VerifyStatus,
} from "@tethys/bindings";
import { gridRows, type McpSyncClient } from "@tethys/state";
import { Badge, Button, ModalDialog } from "@tethys/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectionPreviewDialog } from "./projection-preview-dialog";

interface FallbackRow {
  key: string;
  target: ProjectionTarget;
  scope: Scope;
}

interface RowState {
  verify: VerifyStatus | null;
  plan: ProjectionPlan | null;
  applied: boolean;
  conflict: string | null;
  busy: boolean;
}

const EMPTY_ROW: RowState = {
  verify: null,
  plan: null,
  applied: false,
  conflict: null,
  busy: false,
};

export interface ProjectionFallbackProps {
  client: McpSyncClient;
  workspaceId: string;
  grid: AttachmentGrid;
  activeTarget?: ProjectionTarget | null;
  onChanged?: () => void;
}

export function ProjectionFallback({
  client,
  workspaceId,
  grid,
  activeTarget,
  onChanged,
}: ProjectionFallbackProps) {
  const rows = useMemo<FallbackRow[]>(() => {
    const seen = new Set<string>();
    const result: FallbackRow[] = [];
    for (const row of gridRows(grid)) {
      for (const cell of row.cells) {
        if (cell.state.kind !== "file-projection") continue;
        const key = `${cell.state.target}:${row.server.scope}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          key,
          target: cell.state.target,
          scope: row.server.scope,
        });
      }
    }
    return result;
  }, [grid]);

  const [states, setStates] = useState<Record<string, RowState>>({});
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [rollbackKey, setRollbackKey] = useState<string | null>(null);

  const patch = useCallback((key: string, next: Partial<RowState>) => {
    setStates((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? EMPTY_ROW), ...next },
    }));
  }, []);

  useEffect(() => {
    let active = true;
    for (const row of rows) {
      void client.mcp
        .projection_verify(workspaceId, row.target as TargetId, row.scope)
        .then((verify) => {
          if (active) patch(row.key, { verify });
        })
        .catch(() => {
          if (active) patch(row.key, { verify: null });
        });
    }
    return () => {
      active = false;
    };
  }, [client, rows, workspaceId, patch]);

  if (rows.length === 0) return null;

  const preview = async (row: FallbackRow) => {
    patch(row.key, { busy: true, conflict: null });
    try {
      const plan = await client.mcp.projection_plan(
        workspaceId,
        row.target as TargetId,
        row.scope,
      );
      patch(row.key, { plan, busy: false, conflict: null });
      setPreviewKey(row.key);
    } catch (error) {
      patch(row.key, { busy: false, conflict: messageOf(error) });
    }
  };

  const apply = async (row: FallbackRow, plan: ProjectionPlan) => {
    patch(row.key, { busy: true, conflict: null });
    try {
      await client.mcp.projection_apply(
        workspaceId,
        row.target as TargetId,
        row.scope,
        plan,
      );
      patch(row.key, {
        busy: false,
        applied: true,
        verify: "in-sync",
        conflict: null,
      });
      setPreviewKey(null);
      onChanged?.();
    } catch (error) {
      // The backend re-plans; a mismatch means the workspace changed. Never a
      // silent overwrite — force a re-preview.
      patch(row.key, {
        busy: false,
        plan: null,
        conflict: `workspace changed — re-plan and retry: ${messageOf(error)}`,
      });
    }
  };

  const rollback = async (row: FallbackRow) => {
    patch(row.key, { busy: true });
    try {
      await client.mcp.projection_rollback(
        workspaceId,
        row.target as TargetId,
        row.scope,
      );
      patch(row.key, {
        busy: false,
        applied: false,
        plan: null,
        verify: "missing",
        conflict: null,
      });
      setRollbackKey(null);
      onChanged?.();
    } catch (error) {
      patch(row.key, { busy: false, conflict: messageOf(error) });
      setRollbackKey(null);
    }
  };

  const previewRow = rows.find((row) => row.key === previewKey) ?? null;
  const rollbackRow = rows.find((row) => row.key === rollbackKey) ?? null;
  const previewState = previewKey
    ? (states[previewKey] ?? EMPTY_ROW)
    : EMPTY_ROW;
  const rollbackPath =
    (rollbackKey ? states[rollbackKey]?.plan?.path : null) ??
    `${rollbackRow?.target ?? ""} config`;

  return (
    <section
      data-testid="projection-fallback"
      aria-label="Vendor-file fallback"
      className="flex flex-col gap-md rounded-md border border-(--tethys-hairline) p-lg"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-heading-md text-(--tethys-text-primary)">
          Vendor-file fallback
        </h2>
        <p className="text-body-sm text-(--tethys-text-muted)">
          Only for Providers that negotiated no <code>mcpServers</code>{" "}
          transport. Writes a vendor config file; apply and roll back
          explicitly.
        </p>
      </header>

      {rows.map((row) => {
        const state = states[row.key] ?? EMPTY_ROW;
        const isActive = activeTarget === row.target;
        return (
          <div
            key={row.key}
            data-testid={`fallback-row-${row.key}`}
            data-active={isActive}
            className="flex items-center justify-between gap-md border-t border-(--tethys-hairline) pt-md"
          >
            <div className="flex items-center gap-sm">
              <span className="font-mono text-mono-code text-(--tethys-text-primary)">
                {row.target}
              </span>
              <Badge variant="muted" size="sm">
                {row.scope}
              </Badge>
              {state.verify === "drifted" && (
                <Badge variant="warning" size="sm">
                  drifted
                </Badge>
              )}
              {state.verify === "in-sync" && (
                <Badge variant="success" size="sm">
                  in sync
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-sm">
              <Button
                size="sm"
                variant="secondary"
                disabled={state.busy}
                onClick={() => void preview(row)}
              >
                Preview diff
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={state.plan === null || state.busy}
                onClick={() => state.plan && void apply(row, state.plan)}
              >
                Apply
              </Button>
              {(state.applied ||
                state.verify === "in-sync" ||
                state.verify === "drifted") && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={state.busy}
                  onClick={() => setRollbackKey(row.key)}
                >
                  Rollback
                </Button>
              )}
            </div>
          </div>
        );
      })}

      <ProjectionPreviewDialog
        open={previewRow !== null}
        plan={previewState.plan}
        applying={previewState.busy}
        conflictMessage={previewState.conflict}
        onClose={() => setPreviewKey(null)}
        onApply={() =>
          previewRow && previewState.plan
            ? void apply(previewRow, previewState.plan)
            : undefined
        }
      />

      <ModalDialog
        open={rollbackRow !== null}
        onClose={() => setRollbackKey(null)}
        title="Rollback projection?"
        description={`Reverts and deletes the projected vendor file ${rollbackPath}.`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setRollbackKey(null)}
              className="focus-ring text-label-md text-(--tethys-text-secondary) hover:text-(--tethys-text-primary)"
            >
              Cancel
            </button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => rollbackRow && void rollback(rollbackRow)}
            >
              Rollback
            </Button>
          </>
        }
      >
        <p className="text-body-sm text-(--tethys-text-muted)">
          This deletes the projected file and its manifest entry. It cannot be
          undone.
        </p>
      </ModalDialog>
    </section>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
