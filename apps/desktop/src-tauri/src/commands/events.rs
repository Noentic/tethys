//! `events.*` commands.

use tauri::ipc::Channel;
use tauri::State;
use tethys_api::EventsApi;
use tethys_schema::thread::{EventEnvelope, ThreadId};

use crate::commands::CoreState;

/// `events.subscribe` — streams `EventEnvelope`s over a Channel until the
/// thread is deleted (`architecture.md §12.1`).
#[tauri::command]
pub async fn events_subscribe(
    state: State<'_, CoreState>,
    thread_id: ThreadId,
    since_seq: u32,
    on_event: Channel<EventEnvelope>,
) -> Result<(), String> {
    use futures::StreamExt;
    let mut stream = state
        .events_subscribe(thread_id, since_seq)
        .await
        .map_err(|e| e.to_string())?;
    while let Some(event) = stream.next().await {
        if on_event.send(event).is_err() {
            break;
        }
    }
    Ok(())
}

/// `events.unsubscribe` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn events_unsubscribe(
    state: State<'_, CoreState>,
    thread_id: ThreadId,
) -> Result<(), String> {
    state
        .events_unsubscribe(thread_id)
        .await
        .map_err(|e| e.to_string())
}

stub_cmd!(events_inbox_subscribe);
