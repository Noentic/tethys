//! Low-level database operations on synchronous `rusqlite::Connection`.

use rusqlite::{params, Connection, TransactionBehavior};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tethys_schema::store::{NewEvent, SeqRange, StoredEvent, ThreadId};

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

/// Ensures project exists (creates minimal project record if absent).
pub fn ensure_project(
    conn: &Connection,
    project_id: &str,
    root_path: &str,
    isolation: &str,
) -> Result<(), StoreError> {
    conn.execute(
        "INSERT OR IGNORE INTO projects (id, root_path, isolation) VALUES (?1, ?2, ?3)",
        params![project_id, root_path, isolation],
    )?;
    Ok(())
}

/// Ensures thread exists within a project.
pub fn ensure_thread(
    conn: &Connection,
    thread_id: &ThreadId,
    project_id: &str,
) -> Result<(), StoreError> {
    conn.execute(
        "INSERT OR IGNORE INTO threads (id, project_id, latest_seq) VALUES (?1, ?2, 0)",
        params![thread_id.as_str(), project_id],
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
