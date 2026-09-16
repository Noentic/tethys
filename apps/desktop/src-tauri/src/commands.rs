//! Tauri commands — thin adapters over `tethys-api::TethysApi`.
//!
//! Rules (tauri-v2 skill): owned types only in async commands, `Result`
//! returns, no domain state here (state lives in `tethys-core`).

use std::sync::Arc;
use tauri::State;
use tethys_api::TethysApi;
use tethys_core::Core;
use tethys_schema::{HealthStatus, HostInfo};

pub type CoreState = Arc<Core>;

/// `host.info` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn host_info(state: State<'_, CoreState>) -> Result<HostInfo, String> {
    state.host_info().await.map_err(|e| e.to_string())
}

/// `host.health` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn health(state: State<'_, CoreState>) -> Result<HealthStatus, String> {
    state.health().await.map_err(|e| e.to_string())
}
