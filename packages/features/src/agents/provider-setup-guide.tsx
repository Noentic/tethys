//! `provider-setup-guide` (pen `z23yYi / Codex setup guide`): the numbered
//! install path under a ready-but-undetected provider, and the re-check that
//! makes a fresh install visible.

import { RefreshClockwise } from "@nebutra/icons";
import type { AgentRegistryEntryView } from "@tethys/bindings";
import { Button, IconButton } from "@tethys/ui";
import type { ProviderCatalogEntry } from "./provider-catalog";

export interface ProviderSetupGuideProps {
  entry: ProviderCatalogEntry;
  /** `Not detected` / `Not found` — the chip's word. */
  statusLabel: string;
  registryEntry?: AgentRegistryEntryView | null;
  systemAvailable?: boolean;
  busy?: boolean;
  notice?: string | null;
  onInstall?: () => void;
  onUseSystem?: () => void;
  onRecheck?: () => void;
}

export function ProviderSetupGuide({
  entry,
  statusLabel,
  registryEntry = null,
  systemAvailable = false,
  busy = false,
  notice = null,
  onInstall,
  onUseSystem,
  onRecheck,
}: ProviderSetupGuideProps) {
  const canInstall =
    onInstall &&
    registryEntry &&
    !registryEntry.installed &&
    registryEntry.install_block_reason === null &&
    registryEntry.compliance_note === null;

  return (
    <div
      data-testid="provider-setup-guide"
      className="flex flex-col gap-3 rounded-md bg-(--tethys-surface-nested) p-lg"
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,260px)] sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-body-sm text-(--tethys-text-secondary)">
              Set up {entry.name}
            </span>
            <span className="rounded-xs bg-(--tethys-status-warning-soft) px-1.5 py-0.5 text-label-sm text-(--tethys-status-warning)">
              {statusLabel}
            </span>
          </div>

          {systemAvailable ? (
            <p className="text-body-sm text-(--tethys-text-secondary)">
              Tethys found an ACP executable on this system. Use it for this
              Provider profile.
            </p>
          ) : (
            <>
              {entry.setup.map((step, index) => (
                <div
                  key={step.command}
                  className="flex flex-wrap items-center gap-x-2.5 gap-y-1"
                >
                  <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-(--tethys-surface-hover) font-mono text-mono-micro text-(--tethys-text-muted)">
                    {index + 1}
                  </span>
                  <span className="text-body-sm text-(--tethys-text-primary)">
                    {step.label}
                  </span>
                  <code className="rounded-xs bg-(--tethys-surface-panel) px-2 py-0.5 font-mono text-mono-micro text-(--tethys-text-secondary)">
                    {step.command}
                  </code>
                </div>
              ))}

              {entry.setupNote && (
                <p className="text-body-sm text-(--tethys-text-secondary)">
                  {entry.setupNote}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          {registryEntry && !systemAvailable && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-label-sm text-(--tethys-text-muted) sm:justify-end">
              <span>
                ACP Registry ·{" "}
                {registryEntry.selected_distribution ??
                  "No compatible distribution"}
                {registryEntry.selected_distribution &&
                  ` · v${registryEntry.version}`}
              </span>
              {registryEntry.needs_node && <span>Requires Node.js</span>}
              {registryEntry.needs_uvx && <span>Requires uv</span>}
              {registryEntry.install_block_reason && (
                <span className="text-(--tethys-status-danger)">
                  {registryEntry.install_block_reason}
                </span>
              )}
              {registryEntry.compliance_note && (
                <span className="text-(--tethys-status-warning)">
                  {registryEntry.compliance_note}
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {onUseSystem && (
              <Button
                variant="secondary"
                size="sm"
                loading={busy}
                onClick={onUseSystem}
              >
                Use existing
              </Button>
            )}
            {canInstall && (
              <Button
                variant="primary"
                size="sm"
                loading={busy}
                onClick={onInstall}
              >
                Install
              </Button>
            )}
            {onRecheck && (
              <IconButton
                size="compact"
                label={`Re-check ${entry.name}`}
                onClick={onRecheck}
                className="text-(--tethys-text-secondary)"
              >
                <RefreshClockwise className="size-4" aria-hidden="true" />
              </IconButton>
            )}
          </div>
        </div>
      </div>

      {notice && (
        <p
          className="text-label-sm text-(--tethys-text-secondary)"
          role="status"
        >
          {notice}
        </p>
      )}
    </div>
  );
}
