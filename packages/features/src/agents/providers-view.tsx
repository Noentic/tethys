//! Settings / Providers screen (M1.12): the single source of Provider truth.
//!
//! Reads `agent.profiles_list` into `@tethys/state`'s store, drives the real
//! health poller, registry install/pin/update, login surfaces and the M1.13
//! activity table. `settings.providers.tsx` is left a thin mount (D13).

import type {
  AgentProfileView,
  AgentRegistryEntryView,
  LaunchSpecInput,
  ProcessSample,
  ProfileInput,
} from "@tethys/bindings";
import { createClient } from "@tethys/client";
import {
  ingestProviders,
  markProviderChecking,
  providersStore,
  selectAllProviders,
  selectProviderCancelPhase,
  sessionsRegistryStore,
  useProviders,
} from "@tethys/state";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ActivityTable } from "../monitor";
import { LoginSurface } from "./login-surface";
import {
  catalogEntryForProfile,
  PROVIDER_CATALOG,
  type ProviderCatalogEntry,
} from "./provider-catalog";
import { ProviderRegistry } from "./provider-registry";
import {
  type ProviderRowActions,
  type ProviderRowItem,
  ProviderRows,
} from "./provider-rows";
import { ProvidersHeader } from "./providers-header";
import type { ProvidersClient } from "./types";

const defaultClient = createClient();
// Mirrors `tethys_core::health::DEFAULT_INTERVAL_SECS`, armed at start-up.
const DEFAULT_INTERVAL_SECONDS = 300;

/** `A, B and C` — the detection line's list. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** A row for a profile the catalog does not own (a custom ACP server). */
function entryForProfile(profile: AgentProfileView): ProviderCatalogEntry {
  return {
    id: profile.id,
    registryId:
      profile.integration_id ?? profile.registry_ref?.id ?? profile.id,
    name: profile.name,
    icon: "",
    support: "ready",
    setup: [],
  };
}

export interface ProvidersViewProps {
  client?: ProvidersClient;
  className?: string;
}

function toInput(
  profile: AgentProfileView,
  overrides: Partial<ProfileInput> = {},
): ProfileInput {
  return {
    id: profile.id,
    name: profile.name,
    launch_spec: profile.launch_spec,
    projection_target: profile.projection_target,
    preferred_protocol: profile.preferred_protocol,
    enabled: profile.enabled,
    ...overrides,
  };
}

export function ProvidersView({
  client = defaultClient,
  className,
}: ProvidersViewProps): React.ReactElement {
  const state = useProviders();
  const profiles = selectAllProviders(state);

  const [registry, setRegistry] = useState<AgentRegistryEntryView[]>([]);
  const [intervalSeconds, setIntervalSeconds] = useState(
    DEFAULT_INTERVAL_SECONDS,
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loginProfile, setLoginProfile] = useState<AgentProfileView | null>(
    null,
  );
  // Secrets typed into the env-var form are stored before the close-triggered
  // re-check runs, so that check sees them.
  const pendingSecrets = useRef<Promise<void>>(Promise.resolve());
  const [stderrById, setStderrById] = useState<Record<string, string>>({});
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [registryNotice, setRegistryNotice] = useState<string | null>(null);
  // One process tree per Provider, so Restart and the cancel ladder target the
  // Provider whose processes are listed.
  const [samplesById, setSamplesById] = useState<
    Record<string, ProcessSample[]>
  >({});
  const sessions = useSyncExternalStore(
    (onStoreChange) => {
      const subscription = sessionsRegistryStore.subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    () => sessionsRegistryStore.state.sessions,
  );

  const refresh = useCallback(async () => {
    const next = await client.agent.profilesList();
    ingestProviders(next);
  }, [client]);

  const refreshRegistry = useCallback(async () => {
    setRegistry(await client.agent.registryList());
  }, [client]);

  useEffect(() => {
    void refresh();
    void refreshRegistry();
  }, [refresh, refreshRegistry]);

  // §7.5 whole-tree sampling every 2s for enabled Providers. Keyed on the set
  // of enabled ids so the first sample runs as soon as the list has loaded,
  // not one interval later.
  const enabledKey = profiles
    .filter((profile) => profile.enabled)
    .map((profile) => profile.id)
    .join("\n");
  useEffect(() => {
    const ids = enabledKey === "" ? [] : enabledKey.split("\n");
    let cancelled = false;
    const tick = async () => {
      const batches = await Promise.all(
        ids.map(
          async (id) =>
            [id, await client.agent.processSample(id).catch(() => [])] as const,
        ),
      );
      if (!cancelled) setSamplesById(Object.fromEntries(batches));
    };
    void tick();
    const timer = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client, enabledKey]);

  const manualCheck = useCallback(async () => {
    for (const profile of selectAllProviders(providersStore.state)) {
      if (profile.enabled) markProviderChecking(profile.id);
    }
    await client.agent.recheck();
    await refresh();
  }, [client, refresh]);

  // Network reconnect is one of the seven re-check triggers (spec §5.2).
  useEffect(() => {
    const onOnline = () => void client.agent.recheck().then(refresh);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [client, refresh]);

  const changeInterval = useCallback(
    async (seconds: number) => {
      setIntervalSeconds(seconds);
      await client.agent.healthIntervalSet(seconds);
    },
    [client],
  );

  const toggleEnabled = useCallback(
    async (profile: AgentProfileView, enabled: boolean) => {
      await client.agent.profilesUpdate(toInput(profile, { enabled }));
      await refresh();
    },
    [client, refresh],
  );

  const saveLaunchSpec = useCallback(
    async (
      profile: AgentProfileView,
      launchSpec: LaunchSpecInput,
      preferredProtocol: AgentProfileView["preferred_protocol"],
    ) => {
      await client.agent.profilesUpdate(
        toInput(profile, {
          launch_spec: launchSpec,
          preferred_protocol: preferredProtocol,
        }),
      );
      await refresh();
    },
    [client, refresh],
  );

  const addCustom = useCallback(async () => {
    const created = await client.agent.profilesCreate({
      id: null,
      name: "Custom ACP Server",
      launch_spec: { program: "", args: [], cwd: null, env: [] },
      projection_target: null,
      preferred_protocol: null,
      enabled: true,
    });
    await refresh();
    setExpandedId(created.id);
  }, [client, refresh]);

  const install = useCallback(
    async (entry: AgentRegistryEntryView) => {
      setBusyEntryId(entry.id);
      try {
        const result = await client.agent.registryInstall(
          entry.id,
          entry.version,
        );
        const notices = [
          result.warning,
          result.selection_reason,
          result.needs_node ? "Install Node.js to launch this provider." : null,
          result.needs_uvx ? "Install uv to launch this provider." : null,
        ].filter((message): message is string => message !== null);
        setRegistryNotice(notices.length > 0 ? notices.join(" ") : null);
        await Promise.all([refresh(), refreshRegistry()]);
      } catch (error) {
        setRegistryNotice(
          `Could not install ${entry.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        setBusyEntryId(null);
      }
    },
    [client, refresh, refreshRegistry],
  );

  const attachSystemProfile = useCallback(
    async (entry: AgentRegistryEntryView) => {
      setBusyEntryId(entry.id);
      try {
        // The setup guide can render before the initial profile query settles.
        // Read the source of truth at click time so a repair is not announced
        // as a newly added Provider.
        const currentProfiles = await client.agent.profilesList();
        const alreadyConfigured = currentProfiles.some(
          (profile) =>
            catalogEntryForProfile(PROVIDER_CATALOG, profile)?.registryId ===
            entry.id,
        );
        await client.agent.registryUseSystem(entry.id);
        setRegistryNotice(
          alreadyConfigured
            ? `${entry.name} profile updated to use its ACP executable from your system PATH.`
            : `${entry.name} profile added from its ACP executable on your system PATH.`,
        );
        await Promise.all([refresh(), refreshRegistry()]);
      } catch (error) {
        setRegistryNotice(
          `Could not use the installed ${entry.name} adapter: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        setBusyEntryId(null);
      }
    },
    [client, refresh, refreshRegistry],
  );

  const update = useCallback(
    async (entry: AgentRegistryEntryView) => {
      setBusyEntryId(entry.id);
      try {
        const result = await client.agent.registryUpdate(entry.id);
        const notices = [
          result.warning,
          result.selection_reason,
          result.needs_node ? "Install Node.js to launch this provider." : null,
          result.needs_uvx ? "Install uv to launch this provider." : null,
        ].filter((message): message is string => message !== null);
        setRegistryNotice(notices.length > 0 ? notices.join(" ") : null);
        await Promise.all([refresh(), refreshRegistry()]);
      } catch (error) {
        setRegistryNotice(
          `Could not update ${entry.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        setBusyEntryId(null);
      }
    },
    [client, refresh, refreshRegistry],
  );

  const viewStderr = useCallback(
    async (profile: AgentProfileView) => {
      const text = await client.agent.stderr(profile.id).catch(() => "");
      setStderrById((current) => ({ ...current, [profile.id]: text }));
    },
    [client],
  );

  const telemetryLabel = useMemo(() => {
    const checked = profiles
      .map((profile) => profile.last_checked_ms)
      .filter((value): value is number => value != null);
    if (profiles.some((profile) => profile.recheck === "checking"))
      return "Checking…";
    if (checked.length === 0) return "Not checked yet";
    const seconds = Math.max(
      0,
      Math.round((Date.now() - Math.max(...checked)) / 1000),
    );
    return seconds < 60
      ? `Checked ${seconds}s ago`
      : `Checked ${Math.round(seconds / 60)}m ago`;
  }, [profiles]);

  const activityProfiles = profiles.filter(
    (profile) => (samplesById[profile.id] ?? []).length > 0,
  );

  const matchedProfiles = new Map<string, AgentProfileView>();
  const matchedProfileIds = new Set<string>();
  for (const profile of profiles) {
    const entry = catalogEntryForProfile(PROVIDER_CATALOG, profile);
    if (entry === null) continue;
    if (!matchedProfiles.has(entry.id)) matchedProfiles.set(entry.id, profile);
    matchedProfileIds.add(profile.id);
  }

  // Catalog first, in product order; a profile the catalog does not own (a
  // custom ACP server) renders after them with its own name.
  const catalogRows = PROVIDER_CATALOG.map((entry) => ({
    entry,
    profile:
      entry.support === "soon" ? null : (matchedProfiles.get(entry.id) ?? null),
  }));
  const extraRows = profiles
    .filter((profile) => !matchedProfileIds.has(profile.id))
    .map((profile) => ({ entry: entryForProfile(profile), profile }));
  const rows: ProviderRowItem[] = [...catalogRows, ...extraRows].map(
    ({ entry, profile }) => ({
      entry,
      profile,
      systemEntry:
        registry.find(
          (candidate) =>
            candidate.id === entry.registryId && candidate.system_available,
        ) ?? null,
    }),
  );

  const isDetected = (row: {
    entry: ProviderCatalogEntry;
    profile: AgentProfileView | null;
  }) => row.profile?.enabled === true && row.profile.health !== "not-found";
  const detected = catalogRows.filter(isDetected).length;
  const ready = catalogRows.filter((row) => row.entry.support === "ready");
  const detectedNames = ready.filter(isDetected).map((row) => row.entry.name);
  const setupNames = ready
    .filter((row) => !isDetected(row))
    .map((row) => row.entry.name);
  const soonNames = catalogRows
    .filter((row) => row.entry.support === "soon")
    .map((row) => row.entry.name);
  const detectionDetail = [
    detectedNames.length > 0 ? `${joinNames(detectedNames)} ready` : null,
    setupNames.length > 0 ? `${joinNames(setupNames)} need setup` : null,
    soonNames.length > 0
      ? `${joinNames(soonNames)} arrive in a later milestone`
      : null,
  ]
    .filter(Boolean)
    .join(". ");

  const rowActions: ProviderRowActions = {
    manualCheck: () => void manualCheck(),
    toggleExpanded: (id) =>
      setExpandedId((current) => (current === id ? null : id)),
    toggleEnabled: (profile, enabled) => void toggleEnabled(profile, enabled),
    saveLaunchSpec: (profile, spec, protocol) =>
      void saveLaunchSpec(profile, spec, protocol),
    login: (profile) => setLoginProfile(profile),
    logout: (profile) => void client.agent.logout(profile.id).then(refresh),
    restart: (profile) =>
      void client.agent.connectionsRestart(profile.id).then(refresh),
    viewStderr: (profile) => void viewStderr(profile),
    attachSystem: (entry) => void attachSystemProfile(entry),
    recheck: (profile) => void client.agent.recheck(profile.id).then(refresh),
  };

  return (
    <div
      className={`flex flex-col gap-2xl ${className ?? ""}`}
      data-testid="providers-view"
    >
      <ProvidersHeader
        onManualCheck={() => void manualCheck()}
        onAddCustom={() => void addCustom()}
        telemetryLabel={telemetryLabel}
        intervalSeconds={intervalSeconds}
        onIntervalChange={(seconds) => void changeInterval(seconds)}
      />

      <ProviderRows
        rows={rows}
        catalog={PROVIDER_CATALOG}
        detected={detected}
        detectionDetail={detectionDetail}
        expandedId={expandedId}
        stderrById={stderrById}
        actions={rowActions}
      />

      <ProviderRegistry
        entries={registry}
        notice={registryNotice}
        busyEntryId={busyEntryId}
        onInstall={(entry) => void install(entry)}
        onUseSystem={(entry) => void attachSystemProfile(entry)}
        onUpdate={(entry) => void update(entry)}
      />

      {activityProfiles.length === 0 ? (
        <ActivityTable samples={[]} />
      ) : (
        activityProfiles.map((profile) => (
          <ActivityTable
            key={profile.id}
            title={profile.name}
            samples={samplesById[profile.id] ?? []}
            cancelPhase={selectProviderCancelPhase(sessions, profile.id)}
            onRestart={() =>
              void client.agent.connectionsRestart(profile.id).then(refresh)
            }
          />
        ))
      )}

      {loginProfile && (
        <LoginSurface
          profile={loginProfile}
          onClose={(reason) => {
            const profile = loginProfile;
            setLoginProfile(null);
            const recheck =
              reason === "success"
                ? pendingSecrets.current
                : pendingSecrets.current.then(() =>
                    client.agent.recheck(profile.id),
                  );
            void recheck.then(refresh);
          }}
          onExpiry={() => {
            void client.agent.recheck(loginProfile.id).then(refresh);
          }}
          command={loginProfile.launch_spec.program}
          onLogin={(methodId, input) =>
            client.agent.login(loginProfile.id, methodId, input)
          }
          onTerminalOutput={(terminalId) =>
            client.agent.loginTerminalOutput(loginProfile.id, terminalId)
          }
          onTerminalWrite={(terminalId, text) =>
            client.agent.loginTerminalWrite(loginProfile.id, terminalId, text)
          }
          onTerminalCancel={(terminalId) =>
            client.agent.loginTerminalCancel(loginProfile.id, terminalId)
          }
          onTerminalExit={async () => {
            await client.agent.recheck(loginProfile.id);
            await refresh();
          }}
          onSubmitEnv={async (rows) => {
            // Each value goes straight to the host, which writes it to the
            // keychain and keeps only a reference; nothing is retained here.
            const profile = loginProfile;
            pendingSecrets.current = (async () => {
              for (const row of rows) {
                await client.agent.envSecretSet(profile.id, row.key, row.value);
              }
              await client.agent.recheck(profile.id);
            })();
            await pendingSecrets.current;
          }}
        />
      )}
    </div>
  );
}
