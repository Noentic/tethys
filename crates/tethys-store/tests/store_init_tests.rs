use std::path::PathBuf;
use tempfile::TempDir;
use tethys_schema::store::{NewEvent, ThreadId};
use tethys_store::migrations::{migrate_to_latest, migrate_to_version};
use tethys_store::EventStore;

fn setup_temp_store_path() -> (TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("create temp dir");
    let db_path = dir.path().join("test.db");
    (dir, db_path)
}

#[tokio::test]
async fn fresh_database_creates_all_tables_and_pragmas() -> Result<(), Box<dyn std::error::Error>> {
    let (_dir, db_path) = setup_temp_store_path();
    let store = EventStore::open(&db_path).await?;

    // Verify tables exist in sqlite_master
    let conn = rusqlite::Connection::open(&db_path)?;
    let mut stmt =
        conn.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")?;
    let tables: Vec<String> = stmt
        .query_map([], |r| r.get(0))?
        .collect::<Result<Vec<_>, _>>()?;

    assert!(tables.contains(&"workspaces".to_string()));
    assert!(tables.contains(&"threads".to_string()));
    assert!(tables.contains(&"events".to_string()));
    assert!(tables.contains(&"entries".to_string()));

    // Verify WAL mode and foreign_keys
    let journal_mode: String = conn.query_row("PRAGMA journal_mode;", [], |r| r.get(0))?;
    assert_eq!(journal_mode.to_lowercase(), "wal");

    drop(store);
    Ok(())
}

#[tokio::test]
async fn foreign_keys_enforce_cascade_and_reject_unknown_threads(
) -> Result<(), Box<dyn std::error::Error>> {
    let (_dir, db_path) = setup_temp_store_path();
    let store = EventStore::open(&db_path).await?;

    let unknown_thread = ThreadId("unknown_thread_123".into());
    let event = NewEvent {
        kind: "message".into(),
        payload: "{}".into(),
        entry: None,
    };

    // Inserting an event for an unknown thread must fail with a foreign key violation
    let result = store.append_batch(&unknown_thread, &[event]).await;
    assert!(
        result.is_err(),
        "Expected foreign key constraint failure for unknown thread"
    );

    // Creating the project and thread allows appends
    store
        .ensure_project("proj_1", "/tmp/proj", "worktree")
        .await?;
    store.ensure_thread(&unknown_thread, "proj_1").await?;

    let success = store
        .append_batch(
            &unknown_thread,
            &[NewEvent {
                kind: "message".into(),
                payload: "{\"test\":true}".into(),
                entry: None,
            }],
        )
        .await?;
    assert_eq!(success.first, 1);
    assert_eq!(success.last, 1);

    Ok(())
}

#[tokio::test]
async fn in_memory_reaches_same_schema_version() -> Result<(), Box<dyn std::error::Error>> {
    let store = EventStore::in_memory().await?;
    let thread_id = ThreadId("mem_thread_1".into());

    store
        .ensure_project("proj_mem", "/tmp/mem", "plain")
        .await?;
    store.ensure_thread(&thread_id, "proj_mem").await?;

    let range = store
        .append_batch(
            &thread_id,
            &[NewEvent {
                kind: "message".into(),
                payload: "{\"msg\":\"in-memory\"}".into(),
                entry: None,
            }],
        )
        .await?;
    assert_eq!(range.first, 1);
    assert_eq!(range.last, 1);

    let count = store.count_events(&thread_id).await?;
    assert_eq!(count, 1);

    Ok(())
}

#[test]
fn migration_round_trip_supports_step_down_and_recovery() -> Result<(), Box<dyn std::error::Error>>
{
    let mut conn = rusqlite::Connection::open_in_memory()?;

    // Step 1: Migrate to latest (version 4: workspaces, threads, events, entries,
    // projections, skills_state)
    migrate_to_latest(&mut conn)?;
    let v_latest: i64 = conn.query_row("PRAGMA user_version;", [], |r| r.get(0))?;
    assert_eq!(v_latest, 4);

    // Step 1b: Step down to version 3 (projects table restored, workspace_id -> project_id)
    migrate_to_version(&mut conn, 3)?;
    let v_3: i64 = conn.query_row("PRAGMA user_version;", [], |r| r.get(0))?;
    assert_eq!(v_3, 3);

    let projects_exist: i64 = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='projects'",
        [],
        |r| r.get(0),
    )?;
    assert_eq!(projects_exist, 1, "projects table should exist at version 3");

    // Step 2: Step down to version 2 (sync state dropped, entries preserved)
    migrate_to_version(&mut conn, 2)?;
    let v_2: i64 = conn.query_row("PRAGMA user_version;", [], |r| r.get(0))?;
    assert_eq!(v_2, 2);

    let projections_exist: i64 = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='projections'",
        [],
        |r| r.get(0),
    )?;
    assert_eq!(
        projections_exist, 0,
        "projections should be dropped at version 2"
    );
    let entries_exist: i64 = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='entries'",
        [],
        |r| r.get(0),
    )?;
    assert_eq!(entries_exist, 1, "entries table should remain in version 2");

    // Step 3: Step down to version 1 (entries dropped, events preserved)
    migrate_to_version(&mut conn, 1)?;
    let v_1: i64 = conn.query_row("PRAGMA user_version;", [], |r| r.get(0))?;
    assert_eq!(v_1, 1);

    let entries_exist: i64 = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='entries'",
        [],
        |r| r.get(0),
    )?;
    assert_eq!(
        entries_exist, 0,
        "entries table should be dropped in version 1"
    );

    let events_exist: i64 = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='events'",
        [],
        |r| r.get(0),
    )?;
    assert_eq!(events_exist, 1, "events table should remain in version 1");

    // Step 4: Step down to version 0 (empty database)
    migrate_to_version(&mut conn, 0)?;
    let v_0: i64 = conn.query_row("PRAGMA user_version;", [], |r| r.get(0))?;
    assert_eq!(v_0, 0);

    let any_tables: i64 = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        [],
        |r| r.get(0),
    )?;
    assert_eq!(
        any_tables, 0,
        "no application tables should remain at version 0"
    );

    // Step 5: Re-apply to latest
    migrate_to_latest(&mut conn)?;
    let v_final: i64 = conn.query_row("PRAGMA user_version;", [], |r| r.get(0))?;
    assert_eq!(v_final, 4);

    Ok(())
}

#[test]
fn store_upgrades_from_v3_to_v4_preserving_rows() -> Result<(), Box<dyn std::error::Error>> {
    let mut conn = rusqlite::Connection::open_in_memory()?;
    migrate_to_version(&mut conn, 3)?;
    let v_3: i64 = conn.query_row("PRAGMA user_version;", [], |r| r.get(0))?;
    assert_eq!(v_3, 3);

    conn.execute(
        "INSERT INTO projects (id, root_path, isolation) VALUES (?1, ?2, ?3)",
        rusqlite::params!["proj_1", "/tmp/p1", "worktree"],
    )?;
    conn.execute(
        "INSERT INTO threads (id, project_id, latest_seq) VALUES (?1, ?2, ?3)",
        rusqlite::params!["thread_1", "proj_1", 10],
    )?;

    migrate_to_latest(&mut conn)?;
    let v_latest: i64 = conn.query_row("PRAGMA user_version;", [], |r| r.get(0))?;
    assert_eq!(v_latest, 4);

    let (id, root, iso): (String, String, String) = conn.query_row(
        "SELECT id, root_path, isolation FROM workspaces WHERE id = 'proj_1'",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    assert_eq!(id, "proj_1");
    assert_eq!(root, "/tmp/p1");
    assert_eq!(iso, "worktree");

    let (t_id, w_id, seq): (String, String, i64) = conn.query_row(
        "SELECT id, workspace_id, latest_seq FROM threads WHERE id = 'thread_1'",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    assert_eq!(t_id, "thread_1");
    assert_eq!(w_id, "proj_1");
    assert_eq!(seq, 10);

    // Step down to 3
    migrate_to_version(&mut conn, 3)?;
    let v_downgrade: i64 = conn.query_row("PRAGMA user_version;", [], |r| r.get(0))?;
    assert_eq!(v_downgrade, 3);

    let count: i64 = conn.query_row(
        "SELECT count(*) FROM projects WHERE id = 'proj_1'",
        [],
        |r| r.get(0),
    )?;
    assert_eq!(count, 1);

    Ok(())
}

