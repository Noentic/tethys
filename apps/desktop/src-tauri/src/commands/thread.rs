//! `thread.*` commands.

use tauri::State;
use tethys_api::ThreadApi;
use tethys_schema::cancel::CancelState;
use tethys_schema::queue::QueuedPrompt;
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

/// `thread.queue_list` — the persisted prompt queue (M1.10).
#[tauri::command]
#[specta::specta]
pub async fn thread_queue_list(
    state: State<'_, CoreState>,
    id: ThreadId,
) -> Result<Vec<QueuedPrompt>, String> {
    state.thread_queue_list(id).await.map_err(|e| e.to_string())
}

/// `thread.queue_add` — stages a prompt without interrupting the stream (M1.10).
#[tauri::command]
#[specta::specta]
pub async fn thread_queue_add(
    state: State<'_, CoreState>,
    id: ThreadId,
    blocks: Vec<ContentBlock>,
) -> Result<QueuedPrompt, String> {
    state
        .thread_queue_add(id, blocks)
        .await
        .map_err(|e| e.to_string())
}

/// `thread.queue_remove` — drops one staged prompt (M1.10).
#[tauri::command]
#[specta::specta]
pub async fn thread_queue_remove(
    state: State<'_, CoreState>,
    id: ThreadId,
    queued_id: String,
) -> Result<(), String> {
    state
        .thread_queue_remove(id, queued_id)
        .await
        .map_err(|e| e.to_string())
}

/// `thread.queue_reorder` — persists a new queue order (M1.10).
#[tauri::command]
#[specta::specta]
pub async fn thread_queue_reorder(
    state: State<'_, CoreState>,
    id: ThreadId,
    ordered_ids: Vec<String>,
) -> Result<(), String> {
    state
        .thread_queue_reorder(id, ordered_ids)
        .await
        .map_err(|e| e.to_string())
}

/// `thread.cancel` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_cancel(state: State<'_, CoreState>, id: ThreadId) -> Result<(), String> {
    state.thread_cancel(id).await.map_err(|e| e.to_string())
}

/// `thread.cancel_state` — the typed cancel phase/grace-deadline stub (M1.6c).
#[tauri::command]
#[specta::specta]
pub async fn thread_cancel_state(
    state: State<'_, CoreState>,
    id: ThreadId,
) -> Result<CancelState, String> {
    state
        .thread_cancel_state(id)
        .await
        .map_err(|e| e.to_string())
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

/// `thread.set_config_option` — applies one Provider config option (M1.10).
#[tauri::command]
#[specta::specta]
pub async fn thread_set_config_option(
    state: State<'_, CoreState>,
    id: ThreadId,
    option_id: String,
    value: String,
) -> Result<(), String> {
    state
        .thread_set_config_option(id, option_id, value)
        .await
        .map_err(|e| e.to_string())
}

/// `thread.set_permission_mode` — sets the Supervised / Auto-edit / YOLO mode
/// for one thread (M1.8).
#[tauri::command]
#[specta::specta]
pub async fn thread_set_permission_mode(
    state: State<'_, CoreState>,
    id: ThreadId,
    mode: tethys_schema::workspace::PermissionMode,
) -> Result<(), String> {
    state
        .thread_set_permission_mode(id, mode)
        .await
        .map_err(|e| e.to_string())
}
