//! MCP import wizard (spec §5.4; SYN-04). detect → preview → apply against
//! `mcp.import_scan` / `mcp.import_apply`. The wizard echoes only the
//! `source_path` the workspace-scoped scan returned (address-by-id).

import type { ImportCandidate, ImportScan, Scope } from "@tethys/bindings";
import type { McpSyncClient } from "@tethys/state";
import { Badge, Button, ModalDialog, Select } from "@tethys/ui";
import { useEffect, useState } from "react";

const candidateKey = (candidate: ImportCandidate) =>
  `${candidate.name}:${candidate.source_path}`;

export interface McpImportWizardProps {
  open: boolean;
  client: McpSyncClient;
  workspaceId: string;
  onClose: () => void;
  onImported?: () => void;
}

export function McpImportWizard({
  open,
  client,
  workspaceId,
  onClose,
  onImported,
}: McpImportWizardProps) {
  const [scan, setScan] = useState<ImportScan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [scope, setScope] = useState<Scope>("workspace");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    setScan(null);
    setSelected(new Set());
    void client.mcp
      .import_scan(workspaceId)
      .then((result) => {
        if (active) {
          setScan(result);
          setLoading(false);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(messageOf(cause));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [open, client, workspaceId]);

  const toggle = (candidate: ImportCandidate) => {
    const key = candidateKey(candidate);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const apply = async () => {
    const candidates = (scan?.candidates ?? []).filter((candidate) =>
      selected.has(candidateKey(candidate)),
    );
    if (candidates.length === 0) return;
    setApplying(true);
    try {
      await client.mcp.import_apply(workspaceId, candidates, scope);
      onImported?.();
      onClose();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setApplying(false);
    }
  };

  const candidates = scan?.candidates ?? [];
  const failures = scan?.failures ?? [];

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Import MCP servers"
      description="Scan detected tool configs, preview candidates, then import the selected set."
      maxWidth="max-w-[640px]"
      footer={
        <>
          <Select
            aria-label="Import scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as Scope)}
          >
            <option value="workspace">Workspace</option>
            <option value="global">Global</option>
          </Select>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring text-label-md text-(--tethys-text-secondary) hover:text-(--tethys-text-primary)"
          >
            Cancel
          </button>
          <Button
            size="sm"
            variant="primary"
            loading={applying}
            disabled={selected.size === 0}
            onClick={() => void apply()}
          >
            Import {selected.size > 0 ? selected.size : ""}
          </Button>
        </>
      }
    >
      {loading && (
        <p className="text-body-sm text-(--tethys-text-muted)">Scanning…</p>
      )}
      {error && (
        <p role="alert" className="text-body-sm text-(--tethys-status-danger)">
          {error}
        </p>
      )}

      {scan && candidates.length === 0 && (
        <p className="text-body-sm text-(--tethys-text-muted)">
          No importable servers found.
        </p>
      )}

      {candidates.length > 0 && (
        <ul className="flex flex-col gap-1">
          {candidates.map((candidate) => {
            const checked = selected.has(candidateKey(candidate));
            return (
              <li
                key={candidateKey(candidate)}
                className="flex items-center justify-between gap-md border-b border-(--tethys-hairline) py-2 last:border-b-0"
              >
                <label className="flex items-center gap-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(candidate)}
                    aria-label={`Include ${candidate.name}`}
                  />
                  <span className="font-mono text-mono-code text-(--tethys-text-primary)">
                    {candidate.name}
                  </span>
                  {candidate.conflict && (
                    <Badge variant="warning" size="sm">
                      conflict
                    </Badge>
                  )}
                </label>
                <span className="truncate text-label-sm text-(--tethys-text-muted)">
                  {candidate.source_path}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {failures.length > 0 && (
        <section className="mt-md flex flex-col gap-1 border-t border-(--tethys-hairline) pt-md">
          <h3 className="text-label-sm text-(--tethys-text-muted)">
            Unscannable files
          </h3>
          <ul className="flex flex-col gap-1">
            {failures.map((failure) => (
              <li
                key={failure.source_path}
                className="flex items-center justify-between gap-md text-label-sm text-(--tethys-text-muted)"
              >
                <span className="truncate font-mono text-mono-micro">
                  {failure.source_path}
                </span>
                <span>{failure.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ModalDialog>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
