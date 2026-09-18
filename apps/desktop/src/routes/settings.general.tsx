import { ToggleSwitch } from "@tethys/ui";
import { useState } from "react";

export function SettingsGeneralView() {
  const [telemetry, setTelemetry] = useState<boolean>(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-[var(--tethys-text-primary)]">
          Appearance & System
        </h2>
        <p className="text-xs text-[var(--tethys-text-muted)]">
          Manage general workspace preferences, theme options, and system
          behavior.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--tethys-hairline)] bg-[var(--tethys-surface-card)] p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-[var(--tethys-text-primary)]">
              Anonymous Telemetry
            </div>
            <div className="text-xs text-[var(--tethys-text-muted)]">
              Send anonymous crash and usage statistics.
            </div>
          </div>
          <ToggleSwitch
            id="telemetry-switch"
            label="Anonymous Telemetry"
            checked={telemetry}
            onCheckedChange={setTelemetry}
          />
        </div>
      </div>
    </div>
  );
}
