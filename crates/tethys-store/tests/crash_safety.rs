use rusqlite::{params, Connection, TransactionBehavior};
use tethys_schema::store::{BlobHash, EntryKind, EntryUpsert, NewEvent, ThreadId};
use tethys_store::{schema, EventStore};

#[test]
fn uncommitted_transaction_drop_leaves_no_torn_state() -> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;
    let db_path = dir.path().join("crash_test.db");

    // Open first connection and setup schema
    {
        let mut conn = Connection::open(&db_path)?;
        tethys_store::migrations::migrate_to_latest(&mut conn)?;
        schema::ensure_project(&conn, "proj_1", "/tmp", "worktree")?;
        schema::ensure_thread(&conn, &ThreadId("thread_1".into()), "proj_1")?;
    }

    // Second connection begins immediate transaction, writes half a batch, then drops without commit
    {
        let mut conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        tx.execute(
            "INSERT INTO events (thread_id, seq, event_type, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["thread_1", 1, "test_event", "{\"data\": 1}", 1000],
        )?;
        // Drop tx without commit to simulate sudden process death / uncommitted rollback
        drop(tx);
    }

    // Reopen and check integrity
    {
        let conn = Connection::open(&db_path)?;
        let integrity: String = conn.query_row("PRAGMA integrity_check;", [], |r| r.get(0))?;
        assert_eq!(integrity, "ok", "Database must pass integrity check");

        let event_count: i64 = conn.query_row("SELECT count(*) FROM events", [], |r| r.get(0))?;
        assert_eq!(event_count, 0, "Uncommitted event must not be visible");

        let latest_seq: i64 = conn.query_row(
            "SELECT latest_seq FROM threads WHERE id = 'thread_1'",
            [],
            |r| r.get(0),
        )?;
        assert_eq!(latest_seq, 0, "latest_seq must remain 0");
    }

    Ok(())
}

#[tokio::test]
async fn blob_before_event_failure_leaves_no_dangling_reference() -> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;
    let db_path = dir.path().join("blob_crash.db");
    let store = EventStore::open(&db_path).await?;
    let thread_id = ThreadId("blob_thread".into());

    store.ensure_project("proj_1", "/tmp", "worktree").await?;
    store.ensure_thread(&thread_id, "proj_1").await?;

    // Rule: Blob put first, then event append
    let data = b"payload destined for a thread turn";
    let blob_hash = store.blobs().put(data)?;
    assert!(store.blobs().has(&blob_hash));

    // Case 1: Crash occurs right here before append_batch commits
    // Result: Orphan blob on disk, but store integrity holds and no event committed
    let events = store.events_since(&thread_id, 0, 10).await?;
    assert_eq!(events.len(), 0, "No event committed yet");

    // Case 2: Now commit the event referencing the blob
    let payload = format!("{{\"blob_hash\":\"{}\"}}", blob_hash.as_str());
    store
        .append_batch(
            &thread_id,
            &[NewEvent {
                kind: "blob_reference".into(),
                payload: payload.clone(),
                entry: Some(EntryUpsert {
                    kind: EntryKind::Message,
                    entry_id: "msg_blob_1".into(),
                    turn_index: Some(0),
                    payload,
                }),
            }],
        )
        .await?;

    // Invariant verification: every BlobHash referenced in committed events must exist
    let committed_events = store.events_since(&thread_id, 0, 10).await?;
    assert_eq!(committed_events.len(), 1);

    let v: serde_json::Value = serde_json::from_str(&committed_events[0].payload)?;
    let ref_hash = v["blob_hash"].as_str().expect("must have blob_hash");
    assert!(
        store.blobs().has(&BlobHash(ref_hash.to_string())),
        "Referenced blob must exist in blob store"
    );

    Ok(())
}
