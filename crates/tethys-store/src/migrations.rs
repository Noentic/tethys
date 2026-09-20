//! SQLite migrations management using `rusqlite_migration`.
//!
//! Five migrations:
//! - `0001`: Core schema (`projects`, `threads`, `events`, and indexes).
//! - `0002`: Materialized `entries` table and index for zero-replay thread opens.
//! - `0003`: Sync state (`projections`, `skills_state`).
//! - `0004`: Rename `projects` to `workspaces` and `threads.project_id` to `workspace_id`.
//! - `0005`: Pre-allocate Wave 2's `workspace_trust` and `agent_profiles` tables (DDL only).

use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

use crate::error::StoreError;

/// Returns the schema migrations definition.
pub fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(
            "CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                root_path TEXT NOT NULL,
                isolation TEXT NOT NULL
            );

            CREATE TABLE threads (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
                latest_seq INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
                seq INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(thread_id, seq)
            );

            CREATE INDEX idx_events_thread_seq ON events(thread_id, seq);
            CREATE INDEX idx_threads_project ON threads(project_id);",
        )
        .down(
            "DROP INDEX IF EXISTS idx_threads_project;
            DROP INDEX IF EXISTS idx_events_thread_seq;
            DROP TABLE IF EXISTS events;
            DROP TABLE IF EXISTS threads;
            DROP TABLE IF EXISTS projects;",
        ),
        M::up(
            "CREATE TABLE entries (
                thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                entry_id TEXT NOT NULL,
                first_seq INTEGER NOT NULL,
                last_seq INTEGER NOT NULL,
                turn_index INTEGER,
                payload TEXT NOT NULL,
                PRIMARY KEY (thread_id, kind, entry_id)
            );

            CREATE INDEX idx_entries_thread_first_seq ON entries(thread_id, first_seq);",
        )
        .down(
            "DROP INDEX IF EXISTS idx_entries_thread_first_seq;
            DROP TABLE IF EXISTS entries;",
        ),
        M::up(
            "CREATE TABLE projections (
                target TEXT NOT NULL,
                path TEXT NOT NULL,
                scope TEXT NOT NULL,
                file_hash TEXT NOT NULL,
                created INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                entries TEXT NOT NULL,
                PRIMARY KEY (target, path)
            );

            CREATE TABLE skills_state (
                skill_id TEXT PRIMARY KEY,
                scope TEXT NOT NULL,
                name TEXT NOT NULL,
                source TEXT NOT NULL,
                pinned_sha TEXT,
                content_hash TEXT NOT NULL,
                trusted_hash TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                requires_trust INTEGER NOT NULL DEFAULT 0,
                UNIQUE (scope, name)
            );",
        )
        .down(
            "DROP TABLE IF EXISTS skills_state;
            DROP TABLE IF EXISTS projections;",
        ),
        M::up(
            "ALTER TABLE projects RENAME TO workspaces;
            ALTER TABLE threads RENAME COLUMN project_id TO workspace_id;
            DROP INDEX IF EXISTS idx_threads_project;
            CREATE INDEX idx_threads_workspace ON threads(workspace_id);",
        )
        .down(
            "DROP INDEX IF EXISTS idx_threads_workspace;
            ALTER TABLE threads RENAME COLUMN workspace_id TO project_id;
            ALTER TABLE workspaces RENAME TO projects;
            CREATE INDEX idx_threads_project ON threads(project_id);",
        ),
        // Wave 2's two tables land together in one positional migration
        // (overview D14): the migration index *is* the schema version, so two
        // worktrees appending independently would both define version 5.
        // DDL only — no reader exists yet.
        M::up(
            "CREATE TABLE workspace_trust (
                workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
                resolved_path TEXT NOT NULL,
                host TEXT NOT NULL DEFAULT 'local',
                remote_url TEXT,
                permission_mode TEXT NOT NULL,
                scope TEXT NOT NULL,
                trusted_at INTEGER NOT NULL
            );

            CREATE UNIQUE INDEX idx_workspace_trust_key
                ON workspace_trust(resolved_path, host);

            CREATE TABLE agent_profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                class TEXT NOT NULL,
                launch_spec TEXT NOT NULL,
                registry_ref TEXT,
                projection_target TEXT,
                preferred_protocol TEXT,
                enabled INTEGER NOT NULL DEFAULT 1
            );",
        )
        .down(
            "DROP TABLE IF EXISTS agent_profiles;
            DROP INDEX IF EXISTS idx_workspace_trust_key;
            DROP TABLE IF EXISTS workspace_trust;",
        ),
    ])
}

/// Applies all pending migrations to the latest version on the writer connection.
///
/// Follows the required foreign keys off -> migrate -> foreign keys on sequence.
pub fn migrate_to_latest(conn: &mut Connection) -> Result<(), StoreError> {
    conn.execute_batch("PRAGMA foreign_keys = OFF;")?;
    migrations()
        .to_latest(conn)
        .map_err(|e| StoreError::Migration(e.to_string()))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(())
}

/// Migrates a connection to a specific version (used for round-trip testing).
pub fn migrate_to_version(conn: &mut Connection, version: usize) -> Result<(), StoreError> {
    conn.execute_batch("PRAGMA foreign_keys = OFF;")?;
    migrations()
        .to_version(conn, version)
        .map_err(|e| StoreError::Migration(e.to_string()))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(())
}

/// Verifies that the connection has the expected schema version matching latest migrations.
pub fn verify_schema_version(conn: &Connection) -> Result<(), StoreError> {
    let pending = migrations()
        .pending_migrations(conn)
        .map_err(|e| StoreError::Migration(e.to_string()))?;
    if pending != 0 {
        return Err(StoreError::Migration(format!(
            "schema version not up-to-date: {pending} pending migrations"
        )));
    }
    Ok(())
}
