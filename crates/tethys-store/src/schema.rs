//! Low-level database operations on synchronous `rusqlite::Connection`.

use rusqlite::{params, Connection, TransactionBehavior};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tethys_schema::connection::NormalizedCapabilities;
use tethys_schema::store::{NewEvent, SeqRange, StoredEvent, ThreadId};
use tethys_schema::thread::{ConfigOption, ThreadSummary};

use crate::error::StoreError;

/// Sets required PRAGMAs for a connection in the pool.
pub fn configure_pragmas(
    conn: &Connection,
    cache_size_kb: i32,
    autocheckpoint_pages: u32,
) -> Result<(), StoreError> {
    conn.busy_timeout(Duration::from_millis(5000))?;
    conn.execute_batch(&format!(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA cache_size = -{cache_size_kb};
         PRAGMA wal_autocheckpoint = {autocheckpoint_pages};"
    ))?;
    Ok(())
}

/// A stored workspace record.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceRow {
    pub id: String,
    pub root_path: String,
    pub isolation: String,
}

/// Durable metadata required to reopen a committed ACP thread.
#[derive(Debug, Clone, PartialEq)]
pub struct ThreadRecord {
    pub summary: ThreadSummary,
    pub workdir: String,
    /// Canonical additional trusted roots passed to ACP `additionalDirectories`.
    pub additional_directories: Vec<String>,
    pub config_options: Vec<ConfigOption>,
    pub capabilities: Option<NormalizedCapabilities>,
    pub prepared: bool,
    pub latest_seq: u64,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ThreadMetadata {
    summary: ThreadSummary,
    workdir: String,
    #[serde(default)]
    additional_directories: Vec<String>,
    config_options: Vec<ConfigOption>,
    capabilities: Option<NormalizedCapabilities>,
    prepared: bool,
}

/// Creates or updates the metadata for a persisted thread.
pub fn save_thread(conn: &mut Connection, record: &ThreadRecord) -> Result<(), StoreError> {
    let metadata = serde_json::to_string(&ThreadMetadata {
        summary: record.summary.clone(),
        workdir: record.workdir.clone(),
        additional_directories: record.additional_directories.clone(),
        config_options: record.config_options.clone(),
        capabilities: record.capabilities.clone(),
        prepared: record.prepared,
    })?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    tx.execute(
        "INSERT OR IGNORE INTO threads (id, workspace_id, latest_seq) VALUES (?1, ?2, 0)",
        params![record.summary.id.as_str(), record.summary.workspace_id],
    )?;
    tx.execute(
        "UPDATE threads SET metadata = ?1 WHERE id = ?2 AND workspace_id = ?3",
        params![
            metadata,
            record.summary.id.as_str(),
            record.summary.workspace_id
        ],
    )?;
    let updated = tx.changes();
    if updated == 0 {
        return Err(StoreError::Conflict(format!(
            "thread {} belongs to a different workspace",
            record.summary.id
        )));
    }
    tx.commit()?;
    Ok(())
}

/// Reads thread metadata, including the durable event tail.
pub fn get_thread(
    conn: &Connection,
    thread_id: &ThreadId,
) -> Result<Option<ThreadRecord>, StoreError> {
    let mut stmt = conn.prepare_cached(
        "SELECT metadata, latest_seq FROM threads WHERE id = ?1 AND metadata IS NOT NULL",
    )?;
    let mut rows = stmt.query(params![thread_id.as_str()])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    let metadata: String = row.get(0)?;
    let latest_seq: i64 = row.get(1)?;
    Ok(Some(record_from_metadata(metadata, latest_seq)?))
}

/// Lists all thread records, including prepared drafts for startup cleanup.
pub fn list_threads(conn: &Connection) -> Result<Vec<ThreadRecord>, StoreError> {
    let mut stmt = conn.prepare_cached(
        "SELECT metadata, latest_seq FROM threads WHERE metadata IS NOT NULL ORDER BY id ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        let metadata: String = row.get(0)?;
        let latest_seq: i64 = row.get(1)?;
        Ok((metadata, latest_seq))
    })?;
    let mut records = Vec::new();
    for row in rows {
        let (metadata, latest_seq) = row?;
        records.push(record_from_metadata(metadata, latest_seq)?);
    }
    Ok(records)
}

fn record_from_metadata(metadata: String, latest_seq: i64) -> Result<ThreadRecord, StoreError> {
    let metadata: ThreadMetadata = serde_json::from_str(&metadata)?;
    Ok(ThreadRecord {
        summary: metadata.summary,
        workdir: metadata.workdir,
        additional_directories: metadata.additional_directories,
        config_options: metadata.config_options,
        capabilities: metadata.capabilities,
        prepared: metadata.prepared,
        latest_seq: latest_seq.max(0) as u64,
    })
}

/// Deletes one thread and cascades its events and materialized entries.
pub fn delete_thread(conn: &Connection, thread_id: &ThreadId) -> Result<bool, StoreError> {
    let deleted = conn.execute(
        "DELETE FROM threads WHERE id = ?1 AND metadata IS NOT NULL",
        params![thread_id.as_str()],
    )?;
    Ok(deleted > 0)
}

/// Retrieves a workspace by id if present.
pub fn get_workspace(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Option<WorkspaceRow>, StoreError> {
    let mut stmt =
        conn.prepare_cached("SELECT id, root_path, isolation FROM workspaces WHERE id = ?1")?;
    let mut rows = stmt.query(params![workspace_id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(WorkspaceRow {
            id: row.get(0)?,
            root_path: row.get(1)?,
            isolation: row.get(2)?,
        }))
    } else {
        Ok(None)
    }
}

/// Lists every stored workspace.
pub fn list_workspaces(conn: &Connection) -> Result<Vec<WorkspaceRow>, StoreError> {
    let mut stmt =
        conn.prepare_cached("SELECT id, root_path, isolation FROM workspaces ORDER BY id ASC")?;
    let rows = stmt.query_map([], |row| {
        Ok(WorkspaceRow {
            id: row.get(0)?,
            root_path: row.get(1)?,
            isolation: row.get(2)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// Ensures workspace exists (creates minimal workspace record if absent).
pub fn ensure_workspace(
    conn: &Connection,
    workspace_id: &str,
    root_path: &str,
    isolation: &str,
) -> Result<(), StoreError> {
    conn.execute(
        "INSERT OR IGNORE INTO workspaces (id, root_path, isolation) VALUES (?1, ?2, ?3)",
        params![workspace_id, root_path, isolation],
    )?;
    Ok(())
}

/// Compatibility alias for `ensure_workspace`.
pub fn ensure_project(
    conn: &Connection,
    workspace_id: &str,
    root_path: &str,
    isolation: &str,
) -> Result<(), StoreError> {
    ensure_workspace(conn, workspace_id, root_path, isolation)
}

/// Ensures thread exists within a workspace.
pub fn ensure_thread(
    conn: &Connection,
    thread_id: &ThreadId,
    workspace_id: &str,
) -> Result<(), StoreError> {
    conn.execute(
        "INSERT OR IGNORE INTO threads (id, workspace_id, latest_seq) VALUES (?1, ?2, 0)",
        params![thread_id.as_str(), workspace_id],
    )?;
    Ok(())
}

/// Appends a batch of events inside a single transaction, allocating monotonic seq
/// from threads.latest_seq, materializing entries, and updating latest_seq atomically.
pub fn append_batch(
    conn: &mut Connection,
    thread_id: &ThreadId,
    events: &[NewEvent],
) -> Result<SeqRange, StoreError> {
    if events.is_empty() {
        let current_seq: i64 = conn.query_row(
            "SELECT latest_seq FROM threads WHERE id = ?1",
            params![thread_id.as_str()],
            |r| r.get(0),
        )?;
        return Ok(SeqRange {
            first: current_seq as u64,
            last: current_seq as u64,
        });
    }

    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;

    let current_seq: i64 = tx.query_row(
        "SELECT latest_seq FROM threads WHERE id = ?1",
        params![thread_id.as_str()],
        |r| r.get(0),
    )?;

    let mut seq = current_seq as u64;
    let first_seq = seq + 1;

    {
        let mut insert_event = tx.prepare_cached(
            "INSERT INTO events (thread_id, seq, event_type, payload, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )?;

        let mut upsert_entry = tx.prepare_cached(
            "INSERT INTO entries (thread_id, kind, entry_id, first_seq, last_seq, turn_index, payload)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(thread_id, kind, entry_id) DO UPDATE SET
                 last_seq = excluded.last_seq,
                 turn_index = coalesce(excluded.turn_index, entries.turn_index),
                 payload = excluded.payload",
        )?;

        for event in events {
            seq += 1;
            let now_ms = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);

            insert_event.execute(params![
                thread_id.as_str(),
                seq as i64,
                &event.kind,
                &event.payload,
                now_ms,
            ])?;

            if let Some(entry) = &event.entry {
                upsert_entry.execute(params![
                    thread_id.as_str(),
                    entry.kind.as_str(),
                    &entry.entry_id,
                    seq as i64,
                    seq as i64,
                    entry.turn_index.map(|t| t as i64),
                    &entry.payload,
                ])?;
            }
        }
    }

    tx.execute(
        "UPDATE threads SET latest_seq = ?1 WHERE id = ?2",
        params![seq as i64, thread_id.as_str()],
    )?;

    tx.commit()?;

    Ok(SeqRange {
        first: first_seq,
        last: seq,
    })
}

/// Reads events starting from `since_seq` (exclusive, 1-based, where since_seq=0 returns everything).
pub fn read_events_since(
    conn: &Connection,
    thread_id: &ThreadId,
    since_seq: u64,
    limit: u32,
) -> Result<Vec<StoredEvent>, StoreError> {
    let mut stmt = conn.prepare_cached(
        "SELECT id, thread_id, seq, event_type, payload, created_at
         FROM events
         WHERE thread_id = ?1 AND seq > ?2
         ORDER BY seq ASC
         LIMIT ?3",
    )?;

    let rows = stmt.query_map(
        params![thread_id.as_str(), since_seq as i64, limit as i64],
        |row| {
            let tid: String = row.get(1)?;
            let seq_i64: i64 = row.get(2)?;
            Ok(StoredEvent {
                id: row.get(0)?,
                thread_id: ThreadId(tid),
                seq: seq_i64 as u64,
                event_type: row.get(3)?,
                payload: row.get(4)?,
                created_at: row.get(5)?,
            })
        },
    )?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r?);
    }
    Ok(result)
}

/// Reads events starting from `since_seq` inclusive (for replay/export/import).
pub fn read_events_inclusive(
    conn: &Connection,
    thread_id: &ThreadId,
    since_seq: u64,
    limit: u32,
) -> Result<Vec<StoredEvent>, StoreError> {
    let mut stmt = conn.prepare_cached(
        "SELECT id, thread_id, seq, event_type, payload, created_at
         FROM events
         WHERE thread_id = ?1 AND seq >= ?2
         ORDER BY seq ASC
         LIMIT ?3",
    )?;

    let rows = stmt.query_map(
        params![thread_id.as_str(), since_seq as i64, limit as i64],
        |row| {
            let tid: String = row.get(1)?;
            let seq_i64: i64 = row.get(2)?;
            Ok(StoredEvent {
                id: row.get(0)?,
                thread_id: ThreadId(tid),
                seq: seq_i64 as u64,
                event_type: row.get(3)?,
                payload: row.get(4)?,
                created_at: row.get(5)?,
            })
        },
    )?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r?);
    }
    Ok(result)
}

/// Counts the total events in the thread.
pub fn count_events(conn: &Connection, thread_id: &ThreadId) -> Result<u64, StoreError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM events WHERE thread_id = ?1",
        params![thread_id.as_str()],
        |r| r.get(0),
    )?;
    Ok(count as u64)
}
