//! Providers page header: telemetry label, `↻ Manual Health Check` and the
//! `+ Add Custom ACP Server` action, plus the interval stepper (spec §5.2).

import { Button, IconButton, PageHeader, StepperInput } from "@tethys/ui";

export interface ProvidersHeaderProps {
  onManualCheck: () => void;
  onAddCustom: () => void;
  /** e.g. `Checked 1m ago` / `Checking…`. */
  telemetryLabel: string;
  className?: string;
}

export const MAX_HEALTH_INTERVAL_SECONDS = 3600;

export function ProvidersHeader({
  onManualCheck,
  onAddCustom,
  telemetryLabel,
  className,
}: ProvidersHeaderProps): React.ReactElement {
  return (
    <PageHeader
      className={className}
      title="Providers"
      actions={
        <>
          <span className="text-label-md font-normal text-(--tethys-text-muted)">
            {telemetryLabel}
          </span>
          <Button variant="secondary" size="sm" onClick={onAddCustom}>
            <span aria-hidden>+</span>
            <span>Add Custom ACP Server</span>
          </Button>
          <IconButton
            size="compact"
            label="Manual Health Check"
            onClick={onManualCheck}
            className="text-(--tethys-text-muted)"
          >
            <span aria-hidden>↻</span>
          </IconButton>
        </>
      }
    />
  );
}

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
  const manualOnly = intervalSeconds === 0;
  return (
    <div
      data-testid="health-interval"
      className={`flex items-center gap-sm ${className ?? ""}`}
    >
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
      <span className="text-label-md font-normal text-(--tethys-text-muted)">
        {manualOnly ? "Manual only" : "seconds"}
      </span>
    </div>
  );
}
