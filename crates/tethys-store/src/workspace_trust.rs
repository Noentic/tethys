//! Workspace trust persistence: one row per trusted folder.
//!
//! The trust key is the canonically resolved absolute path plus a host
//! identifier (`local` for MVP); the `workspace_id` primary key keeps the
//! decision joinable with the addressable `workspaces` row.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::StoreError;

/// One row of the `workspace_trust` table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrustRow {
    pub workspace_id: String,
    pub resolved_path: String,
    pub host: String,
    pub remote_url: Option<String>,
    pub permission_mode: String,
    pub scope: String,
    pub trusted_at: i64,
}

/// Inserts or replaces a trust row for its workspace id.
///
/// A grant for a *different* workspace id sharing the same
/// `(resolved_path, host)` violates the unique index and is rejected; the
/// caller re-trusts the existing workspace instead of forking a second row.
pub fn upsert_trust(conn: &Connection, row: &TrustRow) -> Result<(), StoreError> {
    conn.execute(
        "INSERT INTO workspace_trust
             (workspace_id, resolved_path, host, remote_url, permission_mode, scope, trusted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(workspace_id) DO UPDATE SET
             resolved_path = excluded.resolved_path,
             host = excluded.host,
             remote_url = excluded.remote_url,
             permission_mode = excluded.permission_mode,
             scope = excluded.scope,
             trusted_at = excluded.trusted_at",
        params![
            row.workspace_id,
            row.resolved_path,
            row.host,
            row.remote_url,
            row.permission_mode,
            row.scope,
            row.trusted_at,
        ],
    )?;
    Ok(())
}

/// Reads the trust decision for one workspace.
pub fn trust(conn: &Connection, workspace_id: &str) -> Result<Option<TrustRow>, StoreError> {
    conn.query_row(
        "SELECT workspace_id, resolved_path, host, remote_url, permission_mode, scope, trusted_at
         FROM workspace_trust WHERE workspace_id = ?1",
        params![workspace_id],
        row_from_sql,
    )
    .optional()
    .map_err(Into::into)
}

/// Deletes the trust decision for one workspace, reporting whether it existed.
pub fn delete_trust(conn: &Connection, workspace_id: &str) -> Result<bool, StoreError> {
    let deleted = conn.execute(
        "DELETE FROM workspace_trust WHERE workspace_id = ?1",
        params![workspace_id],
    )?;
    Ok(deleted > 0)
}

/// Lists every trust decision, newest first.
pub fn list_trust(conn: &Connection) -> Result<Vec<TrustRow>, StoreError> {
    let mut stmt = conn.prepare_cached(
        "SELECT workspace_id, resolved_path, host, remote_url, permission_mode, scope, trusted_at
         FROM workspace_trust ORDER BY trusted_at DESC, workspace_id ASC",
    )?;
    let rows = stmt.query_map([], row_from_sql)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

fn row_from_sql(row: &rusqlite::Row<'_>) -> rusqlite::Result<TrustRow> {
    Ok(TrustRow {
        workspace_id: row.get(0)?,
        resolved_path: row.get(1)?,
        host: row.get(2)?,
        remote_url: row.get(3)?,
        permission_mode: row.get(4)?,
        scope: row.get(5)?,
        trusted_at: row.get(6)?,
    })
}
