//! `agent.*` commands.

use tauri::State;
use tethys_api::AgentApi;
use tethys_schema::connection::ConnectionEntry;

use crate::commands::CoreState;

stub_cmd!(agent_profiles_list);
stub_cmd!(agent_profiles_create);
stub_cmd!(agent_profiles_update);
stub_cmd!(agent_profiles_delete);
stub_cmd!(agent_registry_list);
stub_cmd!(agent_registry_install);
stub_cmd!(agent_registry_update);

/// `agent.connections.list` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn agent_connections_list(
    state: State<'_, CoreState>,
) -> Result<Vec<ConnectionEntry>, String> {
    state
        .agent_connections_list()
        .await
        .map_err(|e| e.to_string())
}

/// `agent.connections.restart` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn agent_connections_restart(
    state: State<'_, CoreState>,
    profile_id: String,
) -> Result<(), String> {
    state
        .agent_connections_restart(profile_id)
        .await
        .map_err(|e| e.to_string())
}

stub_cmd!(agent_login);
stub_cmd!(agent_logout);
stub_cmd!(agent_stderr);
stub_cmd!(agent_config_schema);
stub_cmd!(agent_config_get);
stub_cmd!(agent_config_validate);
stub_cmd!(agent_config_plan);
stub_cmd!(agent_config_apply);
stub_cmd!(agent_config_rollback);
