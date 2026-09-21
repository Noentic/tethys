//! Providers page header (pen `z23yYi / Page header`): breadcrumb + title,
//! telemetry, `Add Custom ACP Server`, re-check, and the interval stepper.

import { RefreshClockwise } from "@nebutra/icons";
import { Button, IconButton, StepperInput } from "@tethys/ui";

export const MAX_HEALTH_INTERVAL_SECONDS = 3600;

export interface HealthIntervalControlProps {
  intervalSeconds: number;
  onIntervalChange: (seconds: number) => void;
  className?: string;
}

/** The interval stepper; `0` reads `Manual only` and disarms the poller. */
export function HealthIntervalControl({
  intervalSeconds,
  onIntervalChange,
  className,
}: HealthIntervalControlProps): React.ReactElement {
  return (
    <div className={className} data-testid="health-interval">
      <StepperInput
        value={intervalSeconds}
        min={0}
        max={MAX_HEALTH_INTERVAL_SECONDS}
        step={30}
        label="Health check interval in seconds"
        formatValue={(value) => (value === 0 ? "Manual only" : `${value}s`)}
        onChange={(value) =>
          onIntervalChange(
            Math.min(MAX_HEALTH_INTERVAL_SECONDS, Math.max(0, value)),
          )
        }
      />
    </div>
  );
}

export interface ProvidersHeaderProps {
  onManualCheck: () => void;
  onAddCustom: () => void;
  /** e.g. `Checked 1m ago` / `Checking…`. */
  telemetryLabel: string;
  intervalSeconds: number;
  onIntervalChange: (seconds: number) => void;
  className?: string;
}

export function ProvidersHeader({
  onManualCheck,
  onAddCustom,
  telemetryLabel,
  intervalSeconds,
  onIntervalChange,
  className,
}: ProvidersHeaderProps): React.ReactElement {
  return (
    <div
      className={`flex items-center gap-md ${className ?? ""}`}
      data-testid="providers-header"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-label-sm text-(--tethys-text-muted)">
          Settings / Providers
        </span>
        <h1 className="text-heading-lg text-(--tethys-text-primary)">
          Providers
        </h1>
      </div>

      <span className="shrink-0 font-mono text-mono-micro text-(--tethys-text-muted)">
        {telemetryLabel}
      </span>
      <Button variant="secondary" onClick={onAddCustom} className="shrink-0">
        Add Custom ACP Server
      </Button>
      <IconButton
        size="default"
        label="Manual health check"
        onClick={onManualCheck}
        className="shrink-0 text-(--tethys-text-secondary)"
      >
        <RefreshClockwise className="size-4" aria-hidden="true" />
      </IconButton>
      <HealthIntervalControl
        intervalSeconds={intervalSeconds}
        onIntervalChange={onIntervalChange}
        className="shrink-0"
      />
    </div>
  );
}
