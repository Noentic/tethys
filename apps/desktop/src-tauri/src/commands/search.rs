//! `search.*` commands.

use tauri::State;
use tethys_api::SearchApi;
use tethys_schema::sync::WorkspaceId;
use tethys_schema::SearchItem;

use crate::commands::CoreState;

/// `search.files` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn search_files(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    query: String,
    limit: usize,
) -> Result<Vec<SearchItem>, String> {
    state
        .search_files(workspace_id, query, limit)
        .await
        .map_err(|e| e.to_string())
}
