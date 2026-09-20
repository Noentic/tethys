//! `agent.*` client namespace. Wave 2 owner: E (M1.12/M1.13).
//!
//! TODO(E): type every wrapper against tethys-api (profiles, registry,
//! connections, login/logout/stderr and config are still `call<void>()`).

import type { Call } from "../transport";

export function agentNamespace(call: Call) {
  return {
    profilesList: () => call<void>("agent_profiles_list"),
    profiles_list: () => call<void>("agent_profiles_list"),
    profilesCreate: () => call<void>("agent_profiles_create"),
    profiles_create: () => call<void>("agent_profiles_create"),
    profilesUpdate: () => call<void>("agent_profiles_update"),
    profiles_update: () => call<void>("agent_profiles_update"),
    profilesDelete: () => call<void>("agent_profiles_delete"),
    profiles_delete: () => call<void>("agent_profiles_delete"),
    registryList: () => call<void>("agent_registry_list"),
    registry_list: () => call<void>("agent_registry_list"),
    registryInstall: () => call<void>("agent_registry_install"),
    registry_install: () => call<void>("agent_registry_install"),
    registryUpdate: () => call<void>("agent_registry_update"),
    registry_update: () => call<void>("agent_registry_update"),
    connectionsList: () => call<void>("agent_connections_list"),
    connections_list: () => call<void>("agent_connections_list"),
    connectionsRestart: () => call<void>("agent_connections_restart"),
    connections_restart: () => call<void>("agent_connections_restart"),
    login: () => call<void>("agent_login"),
    logout: () => call<void>("agent_logout"),
    stderr: () => call<void>("agent_stderr"),
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
