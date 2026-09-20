use rusqlite::Connection;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tethys_schema::store::{EntryKind, EntryPage, EntryUpsert, NewEvent, ThreadId};
use tethys_store::{entries, schema, EventStore};

#[tokio::test]
async fn append_batch_allocates_monotonic_contiguous_sequences() -> Result<(), Box<dyn std::error::Error>> {
    let store = EventStore::in_memory().await?;
    let thread_id = ThreadId("seq_test_thread".into());

    store.ensure_project("proj_1", "/tmp/p1", "worktree").await?;
    store.ensure_thread(&thread_id, "proj_1").await?;

    // First batch: 3 events
    let batch1 = vec![
        NewEvent {
            kind: "message".into(),
            payload: "{\"chunk\": 1}".into(),
            entry: None,
        },
        NewEvent {
            kind: "message".into(),
            payload: "{\"chunk\": 2}".into(),
            entry: None,
        },
        NewEvent {
            kind: "message".into(),
            payload: "{\"chunk\": 3}".into(),
            entry: None,
        },
    ];

    let range1 = store.append_batch(&thread_id, &batch1).await?;
    assert_eq!(range1.first, 1);
    assert_eq!(range1.last, 3);

    // Second batch: 2 events
    let batch2 = vec![
        NewEvent {
            kind: "tool_call".into(),
            payload: "{\"call\": 1}".into(),
            entry: None,
        },
        NewEvent {
            kind: "tool_call".into(),
            payload: "{\"call\": 2}".into(),
            entry: None,
        },
    ];

    let range2 = store.append_batch(&thread_id, &batch2).await?;
    assert_eq!(range2.first, 4);
    assert_eq!(range2.last, 5);

    let total = store.count_events(&thread_id).await?;
    assert_eq!(total, 5);

    Ok(())
}

#[tokio::test]
async fn entries_materialization_preserves_first_seq_on_upsert() -> Result<(), Box<dyn std::error::Error>> {
    let store = EventStore::in_memory().await?;
    let thread_id = ThreadId("upsert_test_thread".into());

    store.ensure_project("proj_1", "/tmp/p1", "worktree").await?;
    store.ensure_thread(&thread_id, "proj_1").await?;

    // Event 1 creates entry "msg_001" at seq 1
    store
        .append_batch(
            &thread_id,
            &[NewEvent {
                kind: "message".into(),
                payload: "{}".into(),
                entry: Some(EntryUpsert {
                    kind: EntryKind::Message,
                    entry_id: "msg_001".into(),
                    turn_index: Some(0),
                    payload: "{\"text\":\"initial message\"}".into(),
                }),
            }],
        )
        .await?;

    // Event 2 creates entry "msg_002" at seq 2
    store
        .append_batch(
            &thread_id,
            &[NewEvent {
                kind: "message".into(),
                payload: "{}".into(),
                entry: Some(EntryUpsert {
                    kind: EntryKind::Message,
                    entry_id: "msg_002".into(),
                    turn_index: Some(0),
                    payload: "{\"text\":\"second message\"}".into(),
                }),
            }],
        )
        .await?;

    // Event 3 updates entry "msg_001" at seq 3
    store
        .append_batch(
            &thread_id,
            &[NewEvent {
                kind: "message".into(),
                payload: "{}".into(),
                entry: Some(EntryUpsert {
                    kind: EntryKind::Message,
                    entry_id: "msg_001".into(),
                    turn_index: Some(0),
                    payload: "{\"text\":\"updated initial message\"}".into(),
                }),
            }],
        )
        .await?;

    let view = store
        .open_thread(
            &thread_id,
            EntryPage {
                before_first_seq: None,
                limit: 10,
            },
        )
        .await?;

    assert_eq!(view.entries.len(), 2, "There should only be 2 entries due to dedupe/upsert");
    assert_eq!(view.latest_seq, 3);

    // Display order check: msg_001 MUST remain before msg_002 because first_seq was 1
    assert_eq!(view.entries[0].entry_id, "msg_001");
    assert_eq!(view.entries[0].first_seq, 1);
    assert_eq!(view.entries[0].last_seq, 3, "last_seq advanced to 3");
    assert_eq!(view.entries[0].payload, "{\"text\":\"updated initial message\"}");

    assert_eq!(view.entries[1].entry_id, "msg_002");
    assert_eq!(view.entries[1].first_seq, 2);
    assert_eq!(view.entries[1].last_seq, 2);

    Ok(())
}

#[tokio::test]
async fn paged_open_thread_walks_backwards_without_gaps_or_repeats() -> Result<(), Box<dyn std::error::Error>> {
    let store = EventStore::in_memory().await?;
    let thread_id = ThreadId("paging_test_thread".into());

    store.ensure_project("proj_1", "/tmp/p1", "worktree").await?;
    store.ensure_thread(&thread_id, "proj_1").await?;

    // Insert 5 distinct entries
    for i in 1..=5 {
        store
            .append_batch(
                &thread_id,
                &[NewEvent {
                    kind: "message".into(),
                    payload: "{}".into(),
                    entry: Some(EntryUpsert {
                        kind: EntryKind::Message,
                        entry_id: format!("msg_{i:03}"),
                        turn_index: Some(0),
                        payload: format!("{{\"i\":{i}}}"),
                    }),
                }],
            )
            .await?;
    }

    // Page 1: limit 2 from tail -> items [4, 5], has_more = true
    let page1 = store
        .open_thread(
            &thread_id,
            EntryPage {
                before_first_seq: None,
                limit: 2,
            },
        )
        .await?;

    assert_eq!(page1.entries.len(), 2);
    assert_eq!(page1.entries[0].entry_id, "msg_004");
    assert_eq!(page1.entries[1].entry_id, "msg_005");
    assert!(page1.has_more);

    // Page 2: before_first_seq = 4, limit 2 -> items [2, 3], has_more = true
    let next_before = page1.entries[0].first_seq;
    let page2 = store
        .open_thread(
            &thread_id,
            EntryPage {
                before_first_seq: Some(next_before),
                limit: 2,
            },
        )
        .await?;

    assert_eq!(page2.entries.len(), 2);
    assert_eq!(page2.entries[0].entry_id, "msg_002");
    assert_eq!(page2.entries[1].entry_id, "msg_003");
    assert!(page2.has_more);

    // Page 3: before_first_seq = 2, limit 2 -> item [1], has_more = false
    let page3 = store
        .open_thread(
            &thread_id,
            EntryPage {
                before_first_seq: Some(page2.entries[0].first_seq),
                limit: 2,
            },
        )
        .await?;

    assert_eq!(page3.entries.len(), 1);
    assert_eq!(page3.entries[0].entry_id, "msg_001");
    assert!(!page3.has_more);

    Ok(())
}

#[tokio::test]
async fn events_since_filtering() -> Result<(), Box<dyn std::error::Error>> {
    let store = EventStore::in_memory().await?;
    let thread_id = ThreadId("since_test_thread".into());

    store.ensure_project("proj_1", "/tmp/p1", "worktree").await?;
    store.ensure_thread(&thread_id, "proj_1").await?;

    for i in 1..=10 {
        store
            .append_batch(
                &thread_id,
                &[NewEvent {
                    kind: "turn_event".into(),
                    payload: format!("{{\"step\":{i}}}"),
                    entry: None,
                }],
            )
            .await?;
    }

    // since_seq = 0 returns everything
    let all = store.events_since(&thread_id, 0, 100).await?;
    assert_eq!(all.len(), 10);
    assert_eq!(all[0].seq, 1);
    assert_eq!(all[9].seq, 10);

    // since_seq = 7 returns events 8, 9, 10 (tail)
    let tail = store.events_since(&thread_id, 7, 100).await?;
    assert_eq!(tail.len(), 3);
    assert_eq!(tail[0].seq, 8);
    assert_eq!(tail[1].seq, 9);
    assert_eq!(tail[2].seq, 10);

    Ok(())
}

#[test]
fn zero_replay_behavioral_proof_with_authorizer_and_explain_query_plan() -> Result<(), Box<dyn std::error::Error>> {
    let mut conn = Connection::open_in_memory()?;
    tethys_store::migrations::migrate_to_latest(&mut conn)?;

    let thread_id = ThreadId("authorizer_thread".into());
    schema::ensure_project(&conn, "p1", "/tmp/p", "worktree")?;
    schema::ensure_thread(&conn, &thread_id, "p1")?;

    // Append 5 events with entries
    let events = vec![
        NewEvent {
            kind: "message".into(),
            payload: "{}".into(),
            entry: Some(EntryUpsert {
                kind: EntryKind::Message,
                entry_id: "m1".into(),
                turn_index: Some(0),
                payload: "{}".into(),
            }),
        },
        NewEvent {
            kind: "tool_call".into(),
            payload: "{}".into(),
            entry: Some(EntryUpsert {
                kind: EntryKind::ToolCall,
                entry_id: "t1".into(),
                turn_index: Some(0),
                payload: "{}".into(),
            }),
        },
    ];
    schema::append_batch(&mut conn, &thread_id, &events)?;

    // Behavioral Proof 1: Explain query plan for open_thread has NO table SCAN on entries
    let mut qp_stmt = conn.prepare(
        "EXPLAIN QUERY PLAN
         SELECT thread_id, kind, entry_id, first_seq, last_seq, turn_index, payload
         FROM entries
         WHERE thread_id = ?1
         ORDER BY first_seq DESC
         LIMIT ?2",
    )?;

    let plan_lines: Vec<String> = qp_stmt
        .query_map([thread_id.as_str(), "10"], |r| r.get(3))?
        .collect::<Result<Vec<_>, _>>()?;

    let plan_text = plan_lines.join(" ");
    assert!(
        !plan_text.contains("SCAN"),
        "open_thread query plan should use index, not full SCAN: {plan_text}"
    );
    assert!(
        plan_text.contains("SEARCH") || plan_text.contains("USING INDEX"),
        "Query plan must use index: {plan_text}"
    );

    // Behavioral Proof 2: Authorizer DENIES any read from `events` table.
    // open_thread must still succeed with zero reads of events.
    let events_read_attempted = Arc::new(AtomicBool::new(false));
    let flag = events_read_attempted.clone();

    conn.authorizer(Some(move |ctx: rusqlite::hooks::AuthContext<'_>| match ctx.action {
        rusqlite::hooks::AuthAction::Read {
            table_name: "events",
            ..
        } => {
            flag.store(true, Ordering::SeqCst);
            rusqlite::hooks::Authorization::Deny
        }
        _ => rusqlite::hooks::Authorization::Allow,
    }))?;

    let view = entries::open_thread(
        &conn,
        &thread_id,
        EntryPage {
            before_first_seq: None,
            limit: 10,
        },
    )?;

    assert_eq!(view.entries.len(), 2);
    assert!(
        !events_read_attempted.load(Ordering::SeqCst),
        "open_thread must never attempt to read from the events table"
    );

    Ok(())
}
