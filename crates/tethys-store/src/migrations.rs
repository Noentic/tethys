//! SQLite migrations management using `rusqlite_migration`.
//!
//! Two migrations:
//! - `0001`: Core schema (`projects`, `threads`, `events`, and indexes).
//! - `0002`: Materialized `entries` table and index for zero-replay thread opens.

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
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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
