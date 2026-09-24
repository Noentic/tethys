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
  systemEntry: AgentRegistryEntryView | null;
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
  actions,
}: {
  rows: ProviderRowItem[];
  catalog: ProviderCatalogEntry[];
  detected: number;
  detectionDetail: string;
  expandedId: string | null;
  stderrById: Record<string, string>;
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

      {rows.map(({ entry, profile, systemEntry }) => (
        <div key={entry.id} className="flex flex-col">
          <ProviderRow
            entry={entry}
            profile={profile}
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
          {entry.support === "ready" &&
            (profile === null || profile.health === "not-found") && (
              <ProviderSetupGuide
                entry={entry}
                statusLabel={
                  systemEntry
                    ? "ACP adapter found"
                    : profile === null
                      ? "Not configured"
                      : "Not found"
                }
                systemAvailable={systemEntry !== null}
                onUseSystem={
                  systemEntry
                    ? () => actions.attachSystem(systemEntry)
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
