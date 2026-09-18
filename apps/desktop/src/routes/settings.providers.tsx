import { Button } from "@tethys/ui";

export function SettingsProvidersView() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-[var(--tethys-text-primary)]">
          Connected Providers
        </h2>
        <p className="text-xs text-[var(--tethys-text-muted)]">
          Configure AI providers, authentication tokens, and model endpoints
          (M1.12).
        </p>
      </div>

      <div className="rounded-lg border border-[var(--tethys-hairline)] bg-[var(--tethys-surface-card)] p-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-[var(--tethys-text-primary)]">
            Claude Code (Anthropic)
          </div>
          <div className="text-xs text-[var(--tethys-text-muted)]">
            Native ACP integration · Ready
          </div>
        </div>
        <Button size="sm" variant="secondary">
          Configure
        </Button>
      </div>
    </div>
  );
}
