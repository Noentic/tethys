//! `provider-row` (DESIGN.md; pen `Provider Row` ze7h5). One provider line:
//! glyph, status dot, name + protocol/soon chip, mono subtext, latency tag,
//! chevron and toggle. The row's model is `{ entry, profile | null }` because a
//! `soon` or undetected provider has no profile at all.

import { ChevronDown } from "@nebutra/icons";
import type {
  AgentProfileView,
  AgentRegistryEntryView,
} from "@tethys/bindings";
import {
  Button,
  IconButton,
  ProtocolPill,
  StatusDot,
  ToggleSwitch,
} from "@tethys/ui";
import type { ReactNode } from "react";
import type { ProviderCatalogEntry } from "./provider-catalog";
import { providerDotStatus, providerSubtext } from "./provider-status";

export interface ProviderRowProps {
  entry: ProviderCatalogEntry;
  profile: AgentProfileView | null;
  setupActionsAvailable?: boolean;
  registryEntry?: AgentRegistryEntryView | null;
  busy?: boolean;
  actionNotice?: string | null;
  onUpdate?: () => void;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onToggleEnabled?: (enabled: boolean) => void;
  /** A live session state (e.g. `running`) overrides the health dot. */
  sessionState?: string | null;
  children?: ReactNode;
  className?: string;
}

export function ProviderRow({
  entry,
  profile,
  setupActionsAvailable = false,
  registryEntry = null,
  busy = false,
  actionNotice = null,
  onUpdate,
  expanded = false,
  onToggleExpanded,
  onToggleEnabled,
  sessionState,
  children,
  className,
}: ProviderRowProps): React.ReactElement {
  const soon = entry.support === "soon";
  const dotStatus = soon
    ? "disabled"
    : (sessionState ?? providerDotStatus(profile));
  const subtext = soon
    ? "Integration soon — ships in a later milestone"
    : providerSubtext(profile);
  const registryRef = profile?.registry_ref;
  const latency =
    !soon && profile?.latency_ms != null ? `${profile.latency_ms}ms` : null;
  const updateAvailable =
    setupActionsAvailable &&
    entry.support === "ready" &&
    profile !== null &&
    registryEntry !== null &&
    registryRef?.id === registryEntry.id &&
    registryEntry.update?.kind === "available";

  return (
    <div
      data-testid="provider-row"
      data-provider={entry.id}
      data-enabled={profile?.enabled ?? false}
      data-health={soon ? "soon" : (profile?.health ?? "pending")}
      data-support={entry.support}
      className={`border-b border-(--tethys-hairline) last:border-b-0 ${
        profile && !profile.enabled ? "opacity-60" : ""
      } ${className ?? ""}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <img
          src={entry.icon}
          alt=""
          aria-hidden="true"
          className="size-6 shrink-0 rounded-xs"
        />
        {!soon && (
          <StatusDot status={dotStatus} data-testid="provider-row-dot" />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-body-sm text-(--tethys-text-primary)">
              {entry.name}
            </span>
            {!soon && profile?.protocol && (
              <ProtocolPill>
                {profile.protocol === "V2" ? "ACP v2" : "ACP v1"}
              </ProtocolPill>
            )}
            {soon && (
              <span
                data-testid="provider-soon"
                className="rounded-xs bg-(--tethys-surface-hover) px-2 py-0.5 font-mono text-mono-micro text-(--tethys-text-muted)"
              >
                Soon
              </span>
            )}
          </div>
          <span className="truncate font-mono text-mono-micro text-(--tethys-text-muted)">
            {subtext}
          </span>
        </div>

        {latency && (
          <span
            data-testid="provider-latency"
            className="shrink-0 rounded-xs bg-(--tethys-surface-hover) px-1.5 py-0.5 font-mono text-mono-micro text-(--tethys-text-secondary)"
          >
            {latency}
          </span>
        )}

        {updateAvailable && registryRef && registryEntry && (
          <div className="flex shrink-0 items-center gap-2">
            <span
              title={`Pinned ${registryRef.version}; latest ${registryEntry.version}`}
              className="font-mono text-mono-micro text-(--tethys-text-muted)"
            >
              {registryRef.version} → {registryEntry.version}
            </span>
            <Button
              variant="secondary"
              size="sm"
              loading={busy}
              onClick={onUpdate}
            >
              Update
            </Button>
          </div>
        )}

        {!soon && profile && (
          <>
            <IconButton
              size="compact"
              label={`Toggle details for ${entry.name}`}
              aria-expanded={expanded}
              onClick={onToggleExpanded}
              className="text-(--tethys-text-muted)"
            >
              <ChevronDown
                className={`size-4 transition-transform duration-150 ${
                  expanded ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </IconButton>
            <ToggleSwitch
              id={`provider-${entry.id}`}
              label={`Enable ${entry.name}`}
              checked={profile.enabled}
              onCheckedChange={(enabled) => onToggleEnabled?.(enabled)}
            />
          </>
        )}
      </div>

      {expanded && children && <div className="px-4 pb-4">{children}</div>}
      {actionNotice && (
        <p
          className="px-4 pb-3 text-label-sm text-(--tethys-text-secondary)"
          role="status"
        >
          {actionNotice}
        </p>
      )}
    </div>
  );
}
