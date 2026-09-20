//! Queries and materialization over the `entries` table.

use rusqlite::{params, Connection};
use std::str::FromStr;
use tethys_schema::store::{Entry, EntryKind, EntryPage, ThreadId, ThreadView};

use crate::error::StoreError;

/// Reads a page of materialized entries from the tail or before a specific seq.
///
/// Transcripts open at the bottom (reverse-chronological query, reversed to chronological display).
pub fn open_thread(
    conn: &Connection,
    thread_id: &ThreadId,
    page: EntryPage,
) -> Result<ThreadView, StoreError> {
    let latest_seq_i64: i64 = conn.query_row(
        "SELECT latest_seq FROM threads WHERE id = ?1",
        params![thread_id.as_str()],
        |r| r.get(0),
    )?;
    let latest_seq = latest_seq_i64 as u64;

    let query_limit = (page.limit.saturating_add(1)) as i64;

    let mut entries_desc = Vec::new();
    if let Some(before_first_seq) = page.before_first_seq {
        let mut stmt = conn.prepare_cached(
            "SELECT thread_id, kind, entry_id, first_seq, last_seq, turn_index, payload
             FROM entries
             WHERE thread_id = ?1 AND first_seq < ?2
             ORDER BY first_seq DESC
             LIMIT ?3",
        )?;
        let rows = stmt.query_map(
            params![thread_id.as_str(), before_first_seq as i64, query_limit],
            row_to_entry,
        )?;
        for r in rows {
            entries_desc.push(r?);
        }
    } else {
        let mut stmt = conn.prepare_cached(
            "SELECT thread_id, kind, entry_id, first_seq, last_seq, turn_index, payload
             FROM entries
             WHERE thread_id = ?1
             ORDER BY first_seq DESC
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![thread_id.as_str(), query_limit], row_to_entry)?;
        for r in rows {
            entries_desc.push(r?);
        }
    }

    let has_more = entries_desc.len() > page.limit as usize;
    if has_more {
        entries_desc.truncate(page.limit as usize);
    }

    // Reverse to chronological order (first_seq ASC) for display
    entries_desc.reverse();

    Ok(ThreadView {
        entries: entries_desc,
        latest_seq,
        has_more,
    })
}

fn row_to_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<Entry> {
    let tid: String = row.get(0)?;
    let kind_str: String = row.get(1)?;
    let kind = EntryKind::from_str(&kind_str).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(
            1,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e)),
        )
    })?;
    let first_seq: i64 = row.get(3)?;
    let last_seq: i64 = row.get(4)?;
    let turn_index: Option<i64> = row.get(5)?;
    Ok(Entry {
        thread_id: ThreadId(tid),
        kind,
        entry_id: row.get(2)?,
        first_seq: first_seq as u64,
        last_seq: last_seq as u64,
        turn_index: turn_index.map(|t| t as u32),
        payload: row.get(6)?,
    })
}
