//! Provider connection hook (M1.10 selector data; overview D12).
//!
//! **Swap point (Wave 2 checkpoint):** M1.12's `@tethys/state` connection store
//! (`providers.ts`) is now the real source. `selectProviderConnections` maps the
//! stored `AgentProfileView`s onto this selector's shape, and
//! `useProviderConnections` prefers the store, falling back to the fixtures only
//! while the store is empty (so the M1.10 tests and fixtures stay honest).

import type {
  AcpProtocol,
  AgentProfileView,
  ConfigOption,
} from "@tethys/bindings";
import { providersStore, selectAllProviders } from "./providers";

export type ProviderConnectionStatus =
  | "healthy"
  | "auth_required"
  | "missing"
  | "unreachable";

/** One selectable Provider plus its negotiated session-config schema. */
export interface ProviderConnection {
  id: string;
  /** `agent_profile_id` passed to `thread.create`. */
  profileId: string;
  name: string;
  status: ProviderConnectionStatus;
  protocol: AcpProtocol | null;
  configSchema: ConfigOption[];
  /** Declared `authMethods` ids; empty hides the `Sign in` action. */
  authMethods: string[];
  /** Whether the Provider declared image prompts (composer attachments). */
  imagePrompts: boolean;
}

function select(
  id: string,
  name: string,
  category: string,
  values: Array<[string, string]>,
  current: string,
): ConfigOption {
  return {
    id,
    name,
    description: null,
    current_value: current,
    values: values.map(([valueId]) => valueId),
    category,
    kind: "select",
    value_options: values.map(([valueId, display]) => ({
      id: valueId,
      name: display,
      description: null,
    })),
  };
}

export const providerConnectionFixtures: ProviderConnection[] = [
  {
    id: "claude-code",
    profileId: "claude-code",
    name: "Claude Code",
    status: "healthy",
    protocol: "V2",
    authMethods: [],
    imagePrompts: true,
    configSchema: [
      select(
        "model",
        "Model",
        "model",
        [
          ["claude-sonnet-x", "Sonnet"],
          ["claude-opus-x", "Opus"],
          ["claude-haiku-x", "Haiku"],
        ],
        "claude-sonnet-x",
      ),
      select(
        "thought_level",
        "Effort",
        "thought_level",
        [
          ["low", "Low"],
          ["medium", "Medium"],
          ["high", "High"],
        ],
        "medium",
      ),
    ],
  },
  {
    id: "opencode",
    profileId: "opencode",
    name: "OpenCode",
    status: "healthy",
    protocol: "V2",
    authMethods: [],
    imagePrompts: true,
    configSchema: [
      select(
        "model",
        "Model",
        "model",
        [["default-agent", "Default Agent"]],
        "default-agent",
      ),
    ],
  },
  {
    id: "gemini-cli",
    profileId: "gemini-cli",
    name: "Gemini CLI",
    status: "auth_required",
    protocol: "V1",
    authMethods: ["agent-auth"],
    imagePrompts: false,
    configSchema: [],
  },
  {
    id: "codex-cli",
    profileId: "codex-cli",
    name: "Codex CLI",
    status: "missing",
    protocol: null,
    authMethods: [],
    imagePrompts: false,
    configSchema: [],
  },
];

/** Fixture with no connectable Provider (the zero-provider empty state). */
export const noProviderFixtures: ProviderConnection[] = [];

/** Maps a stored profile onto the selector's connectability shape. */
export function toProviderConnection(
  view: AgentProfileView,
): ProviderConnection {
  const status: ProviderConnectionStatus = !view.enabled
    ? "unreachable"
    : view.health === "healthy"
      ? "healthy"
      : view.health === "auth-required"
        ? "auth_required"
        : view.health === "not-found"
          ? "missing"
          : "unreachable";
  return {
    id: view.id,
    profileId: view.id,
    name: view.name,
    status,
    protocol: view.protocol,
    configSchema: [],
    authMethods: view.auth_methods.map((method) => method.id),
    imagePrompts: false,
  };
}

/** The store's Providers as selector rows, in display order. */
export function selectProviderConnections(): ProviderConnection[] {
  return selectAllProviders(providersStore.state).map(toProviderConnection);
}

/**
 * Connected Providers and their status. Pass `providers` to override in a
 * test; otherwise the M1.12 store is the source, with fixtures as the fallback
 * while it is still empty.
 */
export function useProviderConnections(
  providers?: ProviderConnection[],
): ProviderConnection[] {
  if (providers) return providers;
  const live = selectProviderConnections();
  return live.length > 0 ? live : providerConnectionFixtures;
}

/** A Provider is selectable only when healthy. */
export function isProviderSelectable(provider: ProviderConnection): boolean {
  return provider.status === "healthy";
}

/** True when at least one Provider can be selected. */
export function hasSelectableProvider(
  providers: ProviderConnection[],
): boolean {
  return providers.some(isProviderSelectable);
}
