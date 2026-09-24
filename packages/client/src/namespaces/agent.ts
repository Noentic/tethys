//! `agent.*` client namespace. Wave 2 owner: E (M1.12/M1.13).
//!
//! Typed end to end against `tethys-api`; the `config_*` wrappers stay
//! untyped until M2.5 owns their bodies.

import type {
  AgentLoginInput,
  AgentLoginOutcome,
  AgentProfileView,
  AgentRegistryEntryView,
  ConnectionEntry,
  InstallResult,
  LoginTerminalOutput,
  ProcessSample,
  ProfileInput,
} from "@tethys/bindings";

import type { Call } from "../transport";

export function agentNamespace(call: Call) {
  return {
    // === profiles ===
    profilesList: () => call<AgentProfileView[]>("agent_profiles_list"),
    profiles_list: () => call<AgentProfileView[]>("agent_profiles_list"),
    profilesCreate: (input: ProfileInput) =>
      call<AgentProfileView>("agent_profiles_create", { input }),
    profiles_create: (input: ProfileInput) =>
      call<AgentProfileView>("agent_profiles_create", { input }),
    profilesUpdate: (input: ProfileInput) =>
      call<AgentProfileView>("agent_profiles_update", { input }),
    profiles_update: (input: ProfileInput) =>
      call<AgentProfileView>("agent_profiles_update", { input }),
    profilesDelete: (id: string) => call<void>("agent_profiles_delete", { id }),
    profiles_delete: (id: string) =>
      call<void>("agent_profiles_delete", { id }),

    // === registry ===
    registryList: () => call<AgentRegistryEntryView[]>("agent_registry_list"),
    registry_list: () => call<AgentRegistryEntryView[]>("agent_registry_list"),
    registryUseSystem: (id: string) =>
      call<AgentProfileView>("agent_registry_use_system", { id }),
    registry_use_system: (id: string) =>
      call<AgentProfileView>("agent_registry_use_system", { id }),
    registryInstall: (id: string, version?: string) =>
      call<InstallResult>("agent_registry_install", { id, version }),
    registry_install: (id: string, version?: string) =>
      call<InstallResult>("agent_registry_install", { id, version }),
    registryUpdate: (id: string) =>
      call<InstallResult>("agent_registry_update", { id }),
    registry_update: (id: string) =>
      call<InstallResult>("agent_registry_update", { id }),

    // === connections, login, stderr ===
    connectionsList: () => call<ConnectionEntry[]>("agent_connections_list"),
    connections_list: () => call<ConnectionEntry[]>("agent_connections_list"),
    connectionsRestart: (profileId: string) =>
      call<void>("agent_connections_restart", { profileId }),
    connections_restart: (profileId: string) =>
      call<void>("agent_connections_restart", { profileId }),
    login: (profileId: string, methodId: string, input?: AgentLoginInput) =>
      call<AgentLoginOutcome>("agent_login", { profileId, methodId, input }),
    loginTerminalOutput: (profileId: string, terminalId: string) =>
      call<LoginTerminalOutput>("agent_login_terminal_output", {
        profileId,
        terminalId,
      }),
    loginTerminalWrite: (profileId: string, terminalId: string, text: string) =>
      call<void>("agent_login_terminal_write", {
        profileId,
        terminalId,
        text,
      }),
    loginTerminalCancel: (profileId: string, terminalId: string) =>
      call<void>("agent_login_terminal_cancel", { profileId, terminalId }),
    logout: (profileId: string) => call<void>("agent_logout", { profileId }),
    stderr: (profileId: string) => call<string>("agent_stderr", { profileId }),

    // === health + monitoring ===
    processSample: (profileId: string) =>
      call<ProcessSample[]>("agent_process_sample", { profileId }),
    process_sample: (profileId: string) =>
      call<ProcessSample[]>("agent_process_sample", { profileId }),
    envSecretSet: (profileId: string, key: string, value: string) =>
      call<AgentProfileView>("agent_env_secret_set", {
        profileId,
        key,
        value,
      }),
    env_secret_set: (profileId: string, key: string, value: string) =>
      call<AgentProfileView>("agent_env_secret_set", {
        profileId,
        key,
        value,
      }),
    healthIntervalSet: (seconds: number) =>
      call<void>("agent_health_interval_set", { seconds }),
    health_interval_set: (seconds: number) =>
      call<void>("agent_health_interval_set", { seconds }),
    recheck: (profileId?: string) => call<void>("agent_recheck", { profileId }),

    // === native config (M2.5/SYN-11) ===
    configSchema: () => call<void>("agent_config_schema"),
    config_schema: () => call<void>("agent_config_schema"),
    configGet: () => call<void>("agent_config_get"),
    config_get: () => call<void>("agent_config_get"),
    configValidate: () => call<void>("agent_config_validate"),
    config_validate: () => call<void>("agent_config_validate"),
    configPlan: () => call<void>("agent_config_plan"),
    config_plan: () => call<void>("agent_config_plan"),
    configApply: () => call<void>("agent_config_apply"),
    config_apply: () => call<void>("agent_config_apply"),
    configRollback: () => call<void>("agent_config_rollback"),
    config_rollback: () => call<void>("agent_config_rollback"),
  };
}
