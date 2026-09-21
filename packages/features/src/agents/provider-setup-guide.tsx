//! `provider-setup-guide` (pen `z23yYi / Codex setup guide`): the numbered
//! install path under a ready-but-undetected provider, and the re-check that
//! makes a fresh install visible.

import { RefreshClockwise } from "@nebutra/icons";
import { IconButton } from "@tethys/ui";
import type { ProviderCatalogEntry } from "./provider-catalog";

export interface ProviderSetupGuideProps {
  entry: ProviderCatalogEntry;
  /** `Not detected` / `Not found` — the chip's word. */
  statusLabel: string;
  onRecheck: () => void;
}

export function ProviderSetupGuide({
  entry,
  statusLabel,
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

      <div className="flex items-center gap-2">
        <span className="font-mono text-mono-micro text-(--tethys-text-muted)">
          Installed already? Re-check to detect it.
        </span>
        <IconButton
          size="compact"
          label={`Re-check ${entry.name}`}
          onClick={onRecheck}
          className="ml-auto text-(--tethys-text-secondary)"
        >
          <RefreshClockwise className="size-4" aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
