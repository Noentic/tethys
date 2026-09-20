//! `commands.*` commands (the `commands_ns` name avoids a `commands::commands`
//! path; kept consistent with the client's `commands` namespace module).

use tauri::State;
use tethys_api::CommandsApi;
use tethys_schema::composer::{CommandInfo, ExpandedCommand};
use tethys_schema::sync::WorkspaceId;

use crate::commands::CoreState;

/// `commands.list` — discovered `/` Tethys commands (CMP-01).
#[tauri::command]
#[specta::specta]
pub async fn commands_list(
    state: State<'_, CoreState>,
    workspace_id: Option<WorkspaceId>,
) -> Result<Vec<CommandInfo>, String> {
    state
        .commands_list(workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `commands.expand` — expands a command body with args and references.
#[tauri::command]
#[specta::specta]
pub async fn commands_expand(
    state: State<'_, CoreState>,
    command: String,
    args_text: String,
    workspace_id: Option<WorkspaceId>,
) -> Result<ExpandedCommand, String> {
    state
        .commands_expand(command, args_text, workspace_id)
        .await
        .map_err(|e| e.to_string())
}
