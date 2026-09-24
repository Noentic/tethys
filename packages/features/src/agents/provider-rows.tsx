import { RefreshClockwise } from "@nebutra/icons";
import type {
  AgentProfileView,
  AgentRegistryEntryView,
  LaunchSpecInput,
} from "@tethys/bindings";
import { IconButton } from "@tethys/ui";
import { ProviderAccordion } from "./provider-accordion";
import type { ProviderCatalogEntry } from "./provider-catalog";
import { ProviderRow } from "./provider-row";
import { ProviderSetupGuide } from "./provider-setup-guide";

export interface ProviderRowItem {
  entry: ProviderCatalogEntry;
  profile: AgentProfileView | null;
  registryEntry: AgentRegistryEntryView | null;
  setupActionsAvailable: boolean;
}

export interface ProviderRowActions {
  manualCheck: () => void;
  toggleExpanded: (entryId: string) => void;
  toggleEnabled: (profile: AgentProfileView, enabled: boolean) => void;
  saveLaunchSpec: (
    profile: AgentProfileView,
    spec: LaunchSpecInput,
    protocol: AgentProfileView["preferred_protocol"],
  ) => void;
  login: (profile: AgentProfileView) => void;
  logout: (profile: AgentProfileView) => void;
  restart: (profile: AgentProfileView) => void;
  viewStderr: (profile: AgentProfileView) => void;
  install: (entry: AgentRegistryEntryView) => void;
  update: (entry: AgentRegistryEntryView) => void;
  attachSystem: (entry: AgentRegistryEntryView) => void;
  recheck: (profile: AgentProfileView) => void;
}

export function ProviderRows({
  rows,
  catalog,
  detected,
  detectionDetail,
  expandedId,
  stderrById,
  busyEntryId,
  actionNoticeById,
  actions,
}: {
  rows: ProviderRowItem[];
  catalog: ProviderCatalogEntry[];
  detected: number;
  detectionDetail: string;
  expandedId: string | null;
  stderrById: Record<string, string>;
  busyEntryId: string | null;
  actionNoticeById: Record<string, string>;
  actions: ProviderRowActions;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <div
        data-testid="providers-detection"
        className="flex items-center gap-3 rounded-md bg-(--tethys-surface-panel) px-4 py-3"
      >
        <div className="flex shrink-0 items-center gap-1">
          {catalog.map((entry) => (
            <img
              key={entry.id}
              src={entry.icon}
              alt=""
              aria-hidden="true"
              className="size-4"
            />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body-sm text-(--tethys-text-primary)">
            {detected} of {catalog.length} providers detected
          </span>
          <span className="truncate text-label-sm text-(--tethys-text-muted)">
            {detectionDetail}
          </span>
        </div>
        <IconButton
          size="compact"
          label="Re-check providers"
          onClick={actions.manualCheck}
          className="shrink-0 text-(--tethys-text-secondary)"
        >
          <RefreshClockwise className="size-4" aria-hidden="true" />
        </IconButton>
      </div>

      {rows.map(({ entry, profile, registryEntry, setupActionsAvailable }) => (
        <div key={entry.id} className="flex flex-col">
          <ProviderRow
            entry={entry}
            profile={profile}
            registryEntry={registryEntry}
            setupActionsAvailable={setupActionsAvailable}
            busy={busyEntryId === registryEntry?.id}
            actionNotice={
              profile && profile.health !== "not-found"
                ? (actionNoticeById[entry.registryId] ?? null)
                : null
            }
            onUpdate={
              registryEntry ? () => actions.update(registryEntry) : undefined
            }
            expanded={expandedId === entry.id}
            onToggleExpanded={() => actions.toggleExpanded(entry.id)}
            onToggleEnabled={
              profile
                ? (enabled) => actions.toggleEnabled(profile, enabled)
                : undefined
            }
          >
            {profile && (
              <ProviderAccordion
                profile={profile}
                stderr={stderrById[profile.id] ?? ""}
                onSaveLaunchSpec={(spec, protocol) =>
                  actions.saveLaunchSpec(profile, spec, protocol)
                }
                onLogin={() => actions.login(profile)}
                onLogout={() => actions.logout(profile)}
                onRestart={() => actions.restart(profile)}
                onViewStderr={() => actions.viewStderr(profile)}
              />
            )}
          </ProviderRow>
          {setupActionsAvailable &&
            (profile === null || profile.health === "not-found") && (
              <ProviderSetupGuide
                entry={entry}
                statusLabel={
                  registryEntry?.system_available
                    ? "ACP adapter found"
                    : profile === null
                      ? "Not configured"
                      : "Not found"
                }
                registryEntry={registryEntry}
                systemAvailable={registryEntry?.system_available === true}
                busy={busyEntryId === registryEntry?.id}
                notice={actionNoticeById[entry.registryId] ?? null}
                onInstall={
                  setupActionsAvailable &&
                  registryEntry &&
                  profile === null &&
                  !registryEntry.system_available
                    ? () => actions.install(registryEntry)
                    : undefined
                }
                onUseSystem={
                  setupActionsAvailable && registryEntry?.system_available
                    ? () => actions.attachSystem(registryEntry)
                    : undefined
                }
                onRecheck={profile ? () => actions.recheck(profile) : undefined}
              />
            )}
        </div>
      ))}
    </div>
  );
}
