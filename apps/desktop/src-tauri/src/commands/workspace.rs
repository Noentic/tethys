//! `workspace.*` commands.

use tauri::State;
use tethys_api::WorkspaceApi;
use tethys_schema::sync::WorkspaceId;
use tethys_schema::WorkspaceCapabilities;

use crate::commands::CoreState;

stub_cmd!(workspace_list);
stub_cmd!(workspace_add);
stub_cmd!(workspace_remove);
stub_cmd!(workspace_settings_get);
stub_cmd!(workspace_settings_set);
stub_cmd!(workspace_status);

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
