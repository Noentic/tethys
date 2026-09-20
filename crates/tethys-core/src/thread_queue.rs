//! Persisted prompt queue (`thread.queue.*`; M1.10 `CMP-05`).
//!
//! The queue is an append-only projection of three event kinds on a thread's
//! own log in `tethys-store`. No new table or migration exists: `append_batch`
//! already allocates a monotonic `seq` and survives restart, and each
//! `thread.queue.add` event carries the prompt payload, so re-reading the log
//! re-materializes the queue. Remove/reorder append tombstone/order events
//! rather than mutating history (`architecture.md §7.3`).

use serde::Deserialize;
use tethys_schema::queue::QueuedPrompt;
use tethys_schema::store::NewEvent;
use tethys_schema::thread::{ContentBlock, ThreadId};
use tethys_store::{EventStore, StoreError};

use crate::ApiError;

/// Event type prefixes; the `seq` of an `add` is its queue-item identity.
const QUEUE_ADD: &str = "thread.queue.add";
const QUEUE_REMOVE: &str = "thread.queue.remove";
const QUEUE_REORDER: &str = "thread.queue.reorder";

#[derive(Deserialize)]
struct AddPayload {
    blocks: Vec<ContentBlock>,
}

#[derive(Deserialize)]
struct RemovePayload {
    id: String,
}

#[derive(Deserialize)]
struct ReorderPayload {
    ids: Vec<String>,
}

fn to_api(error: StoreError) -> ApiError {
    ApiError::Internal(error.to_string())
}

fn queued_id(seq: u64) -> String {
    format!("q-{seq}")
}

/// Appends a prompt to the thread's queue, returning its materialized item.
///
/// `workspace_root` is persisted alongside the thread row so the queue events
/// satisfy the store's workspace foreign key; an existing row is untouched.
pub async fn add(
    store: &EventStore,
    thread_id: &ThreadId,
    workspace_id: &str,
    workspace_root: &str,
    blocks: Vec<ContentBlock>,
) -> Result<QueuedPrompt, ApiError> {
    store
        .ensure_workspace(workspace_id, workspace_root, "main")
        .await
        .map_err(to_api)?;
    store
        .ensure_thread(thread_id, workspace_id)
        .await
        .map_err(to_api)?;
    let ordinal = list(store, thread_id).await?.len() as u32;
    let payload = serde_json::json!({ "blocks": blocks }).to_string();
    let range = store
        .append_batch(
            thread_id,
            &[NewEvent {
                kind: QUEUE_ADD.into(),
                payload,
                entry: None,
            }],
        )
        .await
        .map_err(to_api)?;
    Ok(QueuedPrompt {
        id: queued_id(range.last),
        thread_id: thread_id.clone(),
        blocks,
        ordinal,
    })
}

/// Re-materializes the current queue for a thread from its event log.
pub async fn list(store: &EventStore, thread_id: &ThreadId) -> Result<Vec<QueuedPrompt>, ApiError> {
    // ponytail: folds the whole thread log on every call; add a `queue_entries`
    // index if non-queue events ever make this scan matter.
    let total = store.count_events(thread_id).await.map_err(to_api)?;
    let limit = u32::try_from(total.min(u32::MAX as u64)).unwrap_or(u32::MAX);
    let events = store
        .read_events(thread_id, 0, limit)
        .await
        .map_err(to_api)?;

    let mut queue: Vec<(String, Vec<ContentBlock>)> = Vec::new();
    for event in events {
        match event.event_type.as_str() {
            QUEUE_ADD => {
                let Ok(payload) = serde_json::from_str::<AddPayload>(&event.payload) else {
                    continue;
                };
                queue.push((queued_id(event.seq), payload.blocks));
            }
            QUEUE_REMOVE => {
                if let Ok(payload) = serde_json::from_str::<RemovePayload>(&event.payload) {
                    queue.retain(|(id, _)| id != &payload.id);
                }
            }
            QUEUE_REORDER => {
                if let Ok(payload) = serde_json::from_str::<ReorderPayload>(&event.payload) {
                    queue.sort_by_key(|(id, _)| {
                        payload
                            .ids
                            .iter()
                            .position(|candidate| candidate == id)
                            .unwrap_or(usize::MAX)
                    });
                }
            }
            _ => {}
        }
    }

    Ok(queue
        .into_iter()
        .enumerate()
        .map(|(ordinal, (id, blocks))| QueuedPrompt {
            id,
            thread_id: thread_id.clone(),
            blocks,
            ordinal: ordinal as u32,
        })
        .collect())
}

/// Appends a tombstone removing one queued item.
pub async fn remove(
    store: &EventStore,
    thread_id: &ThreadId,
    queued_id: &str,
) -> Result<(), ApiError> {
    let payload = serde_json::json!({ "id": queued_id }).to_string();
    store
        .append_batch(
            thread_id,
            &[NewEvent {
                kind: QUEUE_REMOVE.into(),
                payload,
                entry: None,
            }],
        )
        .await
        .map_err(to_api)?;
    Ok(())
}

/// Appends a reorder event; `ordered_ids` is the desired order of the
/// remaining queue.
pub async fn reorder(
    store: &EventStore,
    thread_id: &ThreadId,
    ordered_ids: Vec<String>,
) -> Result<(), ApiError> {
    let payload = serde_json::json!({ "ids": ordered_ids }).to_string();
    store
        .append_batch(
            thread_id,
            &[NewEvent {
                kind: QUEUE_REORDER.into(),
                payload,
                entry: None,
            }],
        )
        .await
        .map_err(to_api)?;
    Ok(())
}
