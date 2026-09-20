//! Agent-profile persistence over the pre-allocated `agent_profiles` table
//! (M1.12; migration `0005` is M1.6d's — this module never adds DDL).
//!
//! `launch_spec` and `registry_ref` are JSON text: the store does not depend on
//! the schema types, so a shape change is a serde change, not a migration.
//! Secrets are never a column (G7); env values are literals or `keychain:…`
//! references resolved only at spawn.

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::StoreError;

/// One row of the `agent_profiles` table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentProfileRow {
    pub id: String,
    pub name: String,
    /// Backend class as text (`registry` / `manual`).
    pub class: String,
    /// `LaunchSpecInput` as JSON.
    pub launch_spec: String,
    /// `RegistryRef` as JSON, when installed from the ACP Registry.
    pub registry_ref: Option<String>,
    pub projection_target: Option<String>,
    pub preferred_protocol: Option<String>,
    pub enabled: bool,
}

/// Inserts a new profile. A duplicate `id` is a [`StoreError::Conflict`].
pub fn insert(conn: &Connection, row: &AgentProfileRow) -> Result<(), StoreError> {
    conn.execute(
        "INSERT INTO agent_profiles
             (id, name, class, launch_spec, registry_ref,
              projection_target, preferred_protocol, enabled)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            row.id,
            row.name,
            row.class,
            row.launch_spec,
            row.registry_ref,
            row.projection_target,
            row.preferred_protocol,
            row.enabled as i64,
        ],
    )
    .map_err(|error| match error {
        rusqlite::Error::SqliteFailure(code, _)
            if code.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            StoreError::Conflict(format!("agent profile {}", row.id))
        }
        other => other.into(),
    })?;
    Ok(())
}

/// Inserts or replaces a profile by id.
pub fn upsert(conn: &Connection, row: &AgentProfileRow) -> Result<(), StoreError> {
    conn.execute(
        "INSERT INTO agent_profiles
             (id, name, class, launch_spec, registry_ref,
              projection_target, preferred_protocol, enabled)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             class = excluded.class,
             launch_spec = excluded.launch_spec,
             registry_ref = excluded.registry_ref,
             projection_target = excluded.projection_target,
             preferred_protocol = excluded.preferred_protocol,
             enabled = excluded.enabled",
        params![
            row.id,
            row.name,
            row.class,
            row.launch_spec,
            row.registry_ref,
            row.projection_target,
            row.preferred_protocol,
            row.enabled as i64,
        ],
    )?;
    Ok(())
}

/// Updates a profile, reporting whether the id existed.
pub fn update(conn: &Connection, row: &AgentProfileRow) -> Result<bool, StoreError> {
    let changed = conn.execute(
        "UPDATE agent_profiles SET
             name = ?2,
             class = ?3,
             launch_spec = ?4,
             registry_ref = ?5,
             projection_target = ?6,
             preferred_protocol = ?7,
             enabled = ?8
         WHERE id = ?1",
        params![
            row.id,
            row.name,
            row.class,
            row.launch_spec,
            row.registry_ref,
            row.projection_target,
            row.preferred_protocol,
            row.enabled as i64,
        ],
    )?;
    Ok(changed > 0)
}

/// Deletes a profile, reporting whether it existed.
pub fn delete(conn: &Connection, id: &str) -> Result<bool, StoreError> {
    let deleted = conn.execute("DELETE FROM agent_profiles WHERE id = ?1", params![id])?;
    Ok(deleted > 0)
}

/// Reads one profile.
pub fn get(conn: &Connection, id: &str) -> Result<Option<AgentProfileRow>, StoreError> {
    conn.query_row(
        "SELECT id, name, class, launch_spec, registry_ref,
                projection_target, preferred_protocol, enabled
         FROM agent_profiles WHERE id = ?1",
        params![id],
        row_from_sql,
    )
    .optional()
    .map_err(Into::into)
}

/// Lists all profiles, ordered by id for stable UI output.
pub fn list(conn: &Connection) -> Result<Vec<AgentProfileRow>, StoreError> {
    let mut statement = conn.prepare(
        "SELECT id, name, class, launch_spec, registry_ref,
                projection_target, preferred_protocol, enabled
         FROM agent_profiles ORDER BY id",
    )?;
    let rows = statement
        .query_map([], row_from_sql)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn row_from_sql(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentProfileRow> {
    Ok(AgentProfileRow {
        id: row.get(0)?,
        name: row.get(1)?,
        class: row.get(2)?,
        launch_spec: row.get(3)?,
        registry_ref: row.get(4)?,
        projection_target: row.get(5)?,
        preferred_protocol: row.get(6)?,
        enabled: row.get::<_, i64>(7)? != 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(id: &str) -> AgentProfileRow {
        AgentProfileRow {
            id: id.to_string(),
            name: format!("Profile {id}"),
            class: "manual".to_string(),
            launch_spec: r#"{"program":"my-agent","args":[],"cwd":null,"env":[]}"#.to_string(),
            registry_ref: None,
            projection_target: None,
            preferred_protocol: Some("V2".to_string()),
            enabled: true,
        }
    }

    fn memory() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory");
        conn.execute_batch(
            "CREATE TABLE agent_profiles (
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
        .expect("schema");
        conn
    }

    #[test]
    fn round_trip_preserves_nulls_and_launch_spec() {
        let conn = memory();
        insert(&conn, &row("a")).expect("insert");
        let stored = get(&conn, "a").expect("get").expect("present");
        assert_eq!(stored, row("a"));
        assert_eq!(stored.projection_target, None);
        assert_eq!(stored.registry_ref, None);
    }

    #[test]
    fn duplicate_id_is_a_typed_conflict() {
        let conn = memory();
        insert(&conn, &row("a")).expect("first");
        let error = insert(&conn, &row("a")).expect_err("duplicate");
        assert!(matches!(error, StoreError::Conflict(_)), "{error:?}");
    }

    #[test]
    fn update_and_delete_report_whether_the_row_existed() {
        let conn = memory();
        assert!(!update(&conn, &row("missing")).expect("update"));
        insert(&conn, &row("a")).expect("insert");
        let mut changed = row("a");
        changed.name = "Renamed".to_string();
        assert!(update(&conn, &changed).expect("update"));
        assert_eq!(
            get(&conn, "a").expect("get").expect("present").name,
            "Renamed"
        );
        assert!(delete(&conn, "a").expect("delete"));
        assert!(!delete(&conn, "a").expect("delete"));
    }

    #[test]
    fn list_is_sorted_by_id() {
        let conn = memory();
        insert(&conn, &row("b")).expect("b");
        insert(&conn, &row("a")).expect("a");
        let ids: Vec<_> = list(&conn)
            .expect("list")
            .into_iter()
            .map(|row| row.id)
            .collect();
        assert_eq!(ids, vec!["a", "b"]);
    }
}
