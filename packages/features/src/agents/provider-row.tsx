//! `provider-row` (DESIGN.md): one Provider line reading the M1.12 store.
//!
//! Toggle and dot are independent axes (DESIGN.md P3): a row switched on with a
//! red dot is a fault; a row switched off is dimmed and worded as a choice. A
//! live session overrides the dot to its session state (sky = streaming).

import type { AgentProfileView } from "@tethys/bindings";
import { IconButton, ProtocolPill, StatusDot, ToggleSwitch } from "@tethys/ui";
import type { ReactNode } from "react";
import {
  healthBadgeText,
  providerDotStatus,
  providerStatusText,
} from "./provider-status";

export interface ProviderRowProps {
  profile: AgentProfileView;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  /** A live session state (e.g. `running`) overrides the health dot. */
  sessionState?: string | null;
  children?: ReactNode;
  className?: string;
}

export function ProviderRow({
  profile,
  expanded,
  onToggleExpanded,
  onToggleEnabled,
  sessionState,
  children,
  className,
}: ProviderRowProps): React.ReactElement {
  const badge = healthBadgeText(profile);
  const dotStatus = sessionState ?? providerDotStatus(profile);

  return (
    <div
      data-testid="provider-row"
      data-enabled={profile.enabled}
      data-health={profile.health}
      className={`border-b border-(--tethys-hairline) last:border-b-0 ${
        profile.enabled ? "" : "opacity-60"
      } ${className ?? ""}`}
    >
      <div className="flex items-center justify-between gap-lg px-4 py-3">
        <div className="flex min-w-0 items-center gap-md">
          <StatusDot status={dotStatus} data-testid="provider-row-dot" />
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-sm">
              <span className="text-heading-md text-(--tethys-text-primary)">
                {profile.name}
              </span>
              {profile.protocol && (
                <ProtocolPill>
                  {profile.protocol === "V2" ? "ACP v2" : "ACP v1"}
                </ProtocolPill>
              )}
              {badge && (
                <span
                  data-testid="health-badge"
                  className="rounded-xs bg-(--tethys-surface-hover) px-1.5 py-0.5 font-mono text-mono-micro text-(--tethys-text-muted)"
                >
                  {badge}
                </span>
              )}
            </div>
            <span className="truncate font-mono text-mono-micro text-(--tethys-text-muted)">
              {providerStatusText(profile)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-md">
          <IconButton
            size="compact"
            label={`Toggle details for ${profile.name}`}
            aria-expanded={expanded}
            onClick={onToggleExpanded}
            className="text-(--tethys-text-muted)"
          >
            {expanded ? <span aria-hidden>▴</span> : <span aria-hidden>▾</span>}
          </IconButton>
          <ToggleSwitch
            id={`provider-${profile.id}`}
            label={`Enable ${profile.name}`}
            checked={profile.enabled}
            onCheckedChange={onToggleEnabled}
          />
        </div>
      </div>

      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
