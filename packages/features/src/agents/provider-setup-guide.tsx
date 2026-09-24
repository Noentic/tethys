//! `provider-setup-guide` (pen `z23yYi / Codex setup guide`): the numbered
//! install path under a ready-but-undetected provider, and the re-check that
//! makes a fresh install visible.

import { RefreshClockwise } from "@nebutra/icons";
import { Button, IconButton } from "@tethys/ui";
import type { ProviderCatalogEntry } from "./provider-catalog";

export interface ProviderSetupGuideProps {
  entry: ProviderCatalogEntry;
  /** `Not detected` / `Not found` — the chip's word. */
  statusLabel: string;
  systemAvailable?: boolean;
  onUseSystem?: () => void;
  onRecheck?: () => void;
}

export function ProviderSetupGuide({
  entry,
  statusLabel,
  systemAvailable = false,
  onUseSystem,
  onRecheck,
}: ProviderSetupGuideProps) {
  return (
    <div
      data-testid="provider-setup-guide"
      className="flex flex-col gap-3 rounded-md bg-(--tethys-surface-nested) p-lg"
    >
      <div className="flex items-center gap-2">
        <span className="text-body-sm text-(--tethys-text-secondary)">
          Set up {entry.name}
        </span>
        <span className="rounded-xs bg-(--tethys-status-warning-soft) px-1.5 py-0.5 text-label-sm text-(--tethys-status-warning)">
          {statusLabel}
        </span>
      </div>

      {systemAvailable ? (
        <p className="text-body-sm text-(--tethys-text-secondary)">
          Tethys found an ACP executable on this system. Reuse it to add one
          Provider profile.
        </p>
      ) : (
        <>
          {entry.setup.map((step, index) => (
            <div key={step.command} className="flex items-center gap-2.5">
              <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-(--tethys-surface-hover) font-mono text-mono-micro text-(--tethys-text-muted)">
                {index + 1}
              </span>
              <span className="text-body-sm text-(--tethys-text-primary)">
                {step.label}
              </span>
              <code className="ml-auto shrink-0 rounded-xs bg-(--tethys-surface-panel) px-2 py-0.5 font-mono text-mono-micro text-(--tethys-text-secondary)">
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

      <div className="flex items-center justify-end gap-2">
        {onUseSystem && (
          <Button variant="secondary" size="sm" onClick={onUseSystem}>
            Use existing
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
  );
}
