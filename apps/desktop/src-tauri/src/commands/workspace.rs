//! `workspace.*` commands.

use tauri::State;
use tethys_api::WorkspaceApi;
use tethys_schema::catalog::{TrustGrant, WorkspaceListItem, WorkspaceTrustState};
use tethys_schema::sync::WorkspaceId;
use tethys_schema::WorkspaceCapabilities;

use crate::commands::CoreState;

stub_cmd!(workspace_settings_get);
stub_cmd!(workspace_settings_set);

/// `workspace.list` — the trust-filtered catalog.
#[tauri::command]
#[specta::specta]
pub async fn workspace_list(state: State<'_, CoreState>) -> Result<Vec<WorkspaceListItem>, String> {
    state.workspace_list().await.map_err(|e| e.to_string())
}

/// `workspace.add` — canonicalize, inspect read-only, grant trust.
#[tauri::command]
#[specta::specta]
pub async fn workspace_add(
    state: State<'_, CoreState>,
    request: TrustGrant,
) -> Result<WorkspaceListItem, String> {
    state
        .workspace_add(request)
        .await
        .map_err(|e| e.to_string())
}

/// `workspace.remove` — revoke trust (the card leaves the catalog).
#[tauri::command]
#[specta::specta]
pub async fn workspace_remove(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
) -> Result<(), String> {
    state
        .workspace_remove(workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `workspace.probe` — read-only VCS kind of a folder the user picked.
#[tauri::command]
#[specta::specta]
pub async fn workspace_probe(
    state: State<'_, CoreState>,
    path: String,
) -> Result<tethys_schema::workspace::Vcs, String> {
    state.workspace_probe(path).await.map_err(|e| e.to_string())
}

/// `workspace.status` — trusted / untrusted / changed.
#[tauri::command]
#[specta::specta]
pub async fn workspace_status(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
) -> Result<WorkspaceTrustState, String> {
    state
        .workspace_status(workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `workspace.capabilities` — resolved capability set for one workspace (§10.6).
#[tauri::command]
#[specta::specta]
pub async fn workspace_capabilities(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
) -> Result<WorkspaceCapabilities, String> {
    state
        .workspace_capabilities(workspace_id)
        .await
        .map_err(|e| e.to_string())
}
