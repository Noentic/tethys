//! `commands.*` commands (the `commands_ns` name avoids a `commands::commands`
//! path; kept consistent with the client's `commands` namespace module).

use tauri::State;
use tethys_api::CommandsApi;
use tethys_schema::composer::{CommandInfo, CommandScope, CommandSource, ExpandedCommand};
use tethys_schema::sync::WorkspaceId;

use crate::commands::CoreState;

/// `commands.list` — discovered `/` Tethys commands (CMP-01).
#[tauri::command]
#[specta::specta]
pub async fn commands_list(
    state: State<'_, CoreState>,
    workspace_id: Option<WorkspaceId>,
    include_shadowed: Option<bool>,
) -> Result<Vec<CommandInfo>, String> {
    state
        .commands_list(workspace_id, include_shadowed.unwrap_or(false))
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

/// `commands.read` — one command's file contents (CMP-07).
#[tauri::command]
#[specta::specta]
pub async fn commands_read(
    state: State<'_, CoreState>,
    scope: CommandScope,
    name: String,
    workspace_id: Option<WorkspaceId>,
) -> Result<CommandSource, String> {
    state
        .commands_read(scope, name, workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `commands.write` — create or update one command file (CMP-07).
#[tauri::command]
#[specta::specta]
pub async fn commands_write(
    state: State<'_, CoreState>,
    scope: CommandScope,
    name: String,
    body: String,
    workspace_id: Option<WorkspaceId>,
) -> Result<CommandInfo, String> {
    state
        .commands_write(scope, name, body, workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `commands.delete` — remove one command file (CMP-07).
#[tauri::command]
#[specta::specta]
pub async fn commands_delete(
    state: State<'_, CoreState>,
    scope: CommandScope,
    name: String,
    workspace_id: Option<WorkspaceId>,
) -> Result<(), String> {
    state
        .commands_delete(scope, name, workspace_id)
        .await
        .map_err(|e| e.to_string())
}
