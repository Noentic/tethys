//! `agent.*` commands.

use tauri::State;
use tethys_api::AgentApi;
use tethys_schema::agents::{
    AgentLoginOutcome, AgentProfileView, AgentRegistryEntryView, InstallResult,
    LoginTerminalOutput, ProcessSample, ProfileInput,
};
use tethys_schema::connection::ConnectionEntry;

use crate::commands::CoreState;

/// `agent.profiles.list` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn agent_profiles_list(
    state: State<'_, CoreState>,
) -> Result<Vec<AgentProfileView>, String> {
    state.agent_profiles_list().await.map_err(|e| e.to_string())
}

/// `agent.profiles.create` — manual profile creation.
#[tauri::command]
#[specta::specta]
pub async fn agent_profiles_create(
    state: State<'_, CoreState>,
    input: ProfileInput,
) -> Result<AgentProfileView, String> {
    state
        .agent_profiles_create(input)
        .await
        .map_err(|e| e.to_string())
}

/// `agent.profiles.update` — launch-spec edits, including the exec path.
#[tauri::command]
#[specta::specta]
pub async fn agent_profiles_update(
    state: State<'_, CoreState>,
    input: ProfileInput,
) -> Result<AgentProfileView, String> {
    state
        .agent_profiles_update(input)
        .await
        .map_err(|e| e.to_string())
}

/// `agent.profiles.delete`.
#[tauri::command]
#[specta::specta]
pub async fn agent_profiles_delete(state: State<'_, CoreState>, id: String) -> Result<(), String> {
    state
        .agent_profiles_delete(id)
        .await
        .map_err(|e| e.to_string())
}

/// `agent.registry.list` — the captured ACP Registry with pins/updates.
#[tauri::command]
#[specta::specta]
pub async fn agent_registry_list(
    state: State<'_, CoreState>,
) -> Result<Vec<AgentRegistryEntryView>, String> {
    state.agent_registry_list().await.map_err(|e| e.to_string())
}

/// `agent.registry.install` — install a pinned version.
#[tauri::command]
#[specta::specta]
pub async fn agent_registry_install(
    state: State<'_, CoreState>,
    id: String,
    version: Option<String>,
) -> Result<InstallResult, String> {
    state
        .agent_registry_install(id, version)
        .await
        .map_err(|e| e.to_string())
}

/// `agent.registry.update` — opt-in update; rewrites the pin only on success.
#[tauri::command]
#[specta::specta]
pub async fn agent_registry_update(
    state: State<'_, CoreState>,
    id: String,
) -> Result<InstallResult, String> {
    state
        .agent_registry_update(id)
        .await
        .map_err(|e| e.to_string())
}

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

/// `agent.login` — triggers the vendor flow for the chosen method.
#[tauri::command]
#[specta::specta]
pub async fn agent_login(
    state: State<'_, CoreState>,
    profile_id: String,
    method_id: String,
) -> Result<AgentLoginOutcome, String> {
    state
        .agent_login(profile_id, method_id)
        .await
        .map_err(|e| e.to_string())
}

/// Reads output and process status from an ACP Terminal Auth PTY.
#[tauri::command]
#[specta::specta]
pub async fn agent_login_terminal_output(
    state: State<'_, CoreState>,
    profile_id: String,
    terminal_id: String,
) -> Result<LoginTerminalOutput, String> {
    state
        .agent_login_terminal_output(profile_id, terminal_id)
        .await
        .map_err(|e| e.to_string())
}

/// Writes terminal input to an ACP Terminal Auth PTY.
#[tauri::command]
#[specta::specta]
pub async fn agent_login_terminal_write(
    state: State<'_, CoreState>,
    profile_id: String,
    terminal_id: String,
    text: String,
) -> Result<(), String> {
    state
        .agent_login_terminal_write(profile_id, terminal_id, text)
        .await
        .map_err(|e| e.to_string())
}

/// Kills and releases an ACP Terminal Auth PTY.
#[tauri::command]
#[specta::specta]
pub async fn agent_login_terminal_cancel(
    state: State<'_, CoreState>,
    profile_id: String,
    terminal_id: String,
) -> Result<(), String> {
    state
        .agent_login_terminal_cancel(profile_id, terminal_id)
        .await
        .map_err(|e| e.to_string())
}

/// `agent.logout` — delegated to the vendor CLI.
#[tauri::command]
#[specta::specta]
pub async fn agent_logout(state: State<'_, CoreState>, profile_id: String) -> Result<(), String> {
    state
        .agent_logout(profile_id)
        .await
        .map_err(|e| e.to_string())
}

/// `agent.stderr` — the captured stderr ring buffer.
#[tauri::command]
#[specta::specta]
pub async fn agent_stderr(
    state: State<'_, CoreState>,
    profile_id: String,
) -> Result<String, String> {
    state
        .agent_stderr(profile_id)
        .await
        .map_err(|e| e.to_string())
}

/// `agent.process_sample` — per-thread process-tree sample (M1.13).
#[tauri::command]
#[specta::specta]
pub async fn agent_process_sample(
    state: State<'_, CoreState>,
    profile_id: String,
) -> Result<Vec<ProcessSample>, String> {
    state
        .agent_process_sample(profile_id)
        .await
        .map_err(|e| e.to_string())
}

/// `agent.env_secret_set` — keychain-backed env binding; write-only (G7).
#[tauri::command]
#[specta::specta]
pub async fn agent_env_secret_set(
    state: State<'_, CoreState>,
    profile_id: String,
    key: String,
    value: String,
) -> Result<AgentProfileView, String> {
    state
        .agent_env_secret_set(profile_id, key, value)
        .await
        .map_err(|e| e.to_string())
}

/// `agent.health_interval_set` — `0` disarms the poller (`Manual only`).
#[tauri::command]
#[specta::specta]
pub async fn agent_health_interval_set(
    state: State<'_, CoreState>,
    seconds: u32,
) -> Result<(), String> {
    state
        .agent_health_interval_set(seconds)
        .await
        .map_err(|e| e.to_string())
}

/// `agent.recheck` — one profile, or all enabled when omitted.
#[tauri::command]
#[specta::specta]
pub async fn agent_recheck(
    state: State<'_, CoreState>,
    profile_id: Option<String>,
) -> Result<(), String> {
    state
        .agent_recheck(profile_id)
        .await
        .map_err(|e| e.to_string())
}

stub_cmd!(agent_config_schema);
stub_cmd!(agent_config_get);
stub_cmd!(agent_config_validate);
stub_cmd!(agent_config_plan);
stub_cmd!(agent_config_apply);
stub_cmd!(agent_config_rollback);
