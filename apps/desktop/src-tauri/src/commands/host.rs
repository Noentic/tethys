//! `host.*` commands.

use tauri::State;
use tethys_api::HostApi;
use tethys_schema::{HealthStatus, HostInfo};

use crate::commands::CoreState;

/// `host.info` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn host_info(state: State<'_, CoreState>) -> Result<HostInfo, String> {
    state.host_info().await.map_err(|e| e.to_string())
}

stub_cmd!(host_pair);

/// `host.health` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn health(state: State<'_, CoreState>) -> Result<HealthStatus, String> {
    state.health().await.map_err(|e| e.to_string())
}
