//! `thread.*` commands.

use tauri::State;
use tethys_api::ThreadApi;
use tethys_schema::thread::{ContentBlock, CreateThread, ThreadId, ThreadSummary, ThreadView};

use crate::commands::CoreState;

/// `thread.create` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_create(
    state: State<'_, CoreState>,
    request: CreateThread,
) -> Result<ThreadSummary, String> {
    state
        .thread_create(request)
        .await
        .map_err(|e| e.to_string())
}

/// `thread.list` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_list(state: State<'_, CoreState>) -> Result<Vec<ThreadSummary>, String> {
    state.thread_list().await.map_err(|e| e.to_string())
}

/// `thread.get` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_get(state: State<'_, CoreState>, id: ThreadId) -> Result<ThreadView, String> {
    state.thread_get(id).await.map_err(|e| e.to_string())
}

/// `thread.prompt` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_prompt(
    state: State<'_, CoreState>,
    id: ThreadId,
    blocks: Vec<ContentBlock>,
) -> Result<(), String> {
    state
        .thread_prompt(id, blocks)
        .await
        .map_err(|e| e.to_string())
}

stub_cmd!(thread_queue_list);
stub_cmd!(thread_queue_add);
stub_cmd!(thread_queue_remove);
stub_cmd!(thread_queue_reorder);

/// `thread.cancel` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_cancel(state: State<'_, CoreState>, id: ThreadId) -> Result<(), String> {
    state.thread_cancel(id).await.map_err(|e| e.to_string())
}

/// `thread.resume` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_resume(state: State<'_, CoreState>, id: ThreadId) -> Result<(), String> {
    state.thread_resume(id).await.map_err(|e| e.to_string())
}

stub_cmd!(thread_import_sessions);
stub_cmd!(thread_fork);

/// `thread.archive` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_archive(state: State<'_, CoreState>, id: ThreadId) -> Result<(), String> {
    state.thread_archive(id).await.map_err(|e| e.to_string())
}

/// `thread.delete` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_delete(state: State<'_, CoreState>, id: ThreadId) -> Result<(), String> {
    state.thread_delete(id).await.map_err(|e| e.to_string())
}

stub_cmd!(thread_set_config_option);
stub_cmd!(thread_set_permission_mode);
