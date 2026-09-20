//! Sync-state persistence: projection ownership and skill trust rows.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::StoreError;

/// One row of the `projections` table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectionRow {
    pub target: String,
    pub path: String,
    pub scope: String,
    pub file_hash: String,
    pub created: bool,
    pub updated_at: i64,
    pub entries: String,
}

/// One row of the `skills_state` table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillRow {
    pub skill_id: String,
    pub scope: String,
    pub name: String,
    pub source: String,
    pub pinned_sha: Option<String>,
    pub content_hash: String,
    pub trusted_hash: Option<String>,
    pub enabled: bool,
    pub requires_trust: bool,
}

/// Inserts or replaces a projection row.
pub fn upsert_projection(conn: &Connection, row: &ProjectionRow) -> Result<(), StoreError> {
    conn.execute(
        "INSERT INTO projections (target, path, scope, file_hash, created, updated_at, entries)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(target, path) DO UPDATE SET
             scope = excluded.scope,
             file_hash = excluded.file_hash,
             created = excluded.created,
             updated_at = excluded.updated_at,
             entries = excluded.entries",
        params![
            row.target,
            row.path,
            row.scope,
            row.file_hash,
            row.created as i64,
            row.updated_at,
            row.entries,
        ],
    )?;
    Ok(())
}

/// Reads one projection row.
pub fn projection(
    conn: &Connection,
    target: &str,
    path: &str,
) -> Result<Option<ProjectionRow>, StoreError> {
    conn.query_row(
        "SELECT target, path, scope, file_hash, created, updated_at, entries
         FROM projections WHERE target = ?1 AND path = ?2",
        params![target, path],
        row_from_sql,
    )
    .optional()
    .map_err(Into::into)
}

/// Deletes one projection row, reporting whether it existed.
pub fn delete_projection(conn: &Connection, target: &str, path: &str) -> Result<bool, StoreError> {
    let deleted = conn.execute(
        "DELETE FROM projections WHERE target = ?1 AND path = ?2",
        params![target, path],
    )?;
    Ok(deleted > 0)
}

fn row_from_sql(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectionRow> {
    Ok(ProjectionRow {
        target: row.get(0)?,
        path: row.get(1)?,
        scope: row.get(2)?,
        file_hash: row.get(3)?,
        created: row.get::<_, i64>(4)? != 0,
        updated_at: row.get(5)?,
        entries: row.get(6)?,
    })
}

/// Inserts or replaces a skill row.
pub fn upsert_skill(conn: &Connection, row: &SkillRow) -> Result<(), StoreError> {
    conn.execute(
        "INSERT INTO skills_state
             (skill_id, scope, name, source, pinned_sha, content_hash,
              trusted_hash, enabled, requires_trust)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(skill_id) DO UPDATE SET
             scope = excluded.scope,
             name = excluded.name,
             source = excluded.source,
             pinned_sha = excluded.pinned_sha,
             content_hash = excluded.content_hash,
             trusted_hash = excluded.trusted_hash,
             enabled = excluded.enabled,
             requires_trust = excluded.requires_trust",
        params![
            row.skill_id,
            row.scope,
            row.name,
            row.source,
            row.pinned_sha,
            row.content_hash,
            row.trusted_hash,
            row.enabled as i64,
            row.requires_trust as i64,
        ],
    )?;
    Ok(())
}

/// Reads one skill row.
pub fn skill(conn: &Connection, skill_id: &str) -> Result<Option<SkillRow>, StoreError> {
    conn.query_row(
        "SELECT skill_id, scope, name, source, pinned_sha, content_hash,
                trusted_hash, enabled, requires_trust
         FROM skills_state WHERE skill_id = ?1",
        params![skill_id],
        row_from_skill_sql,
    )
    .optional()
    .map_err(Into::into)
}

fn row_from_skill_sql(row: &rusqlite::Row<'_>) -> rusqlite::Result<SkillRow> {
    Ok(SkillRow {
        skill_id: row.get(0)?,
        scope: row.get(1)?,
        name: row.get(2)?,
        source: row.get(3)?,
        pinned_sha: row.get(4)?,
        content_hash: row.get(5)?,
        trusted_hash: row.get(6)?,
        enabled: row.get::<_, i64>(7)? != 0,
        requires_trust: row.get::<_, i64>(8)? != 0,
    })
}
