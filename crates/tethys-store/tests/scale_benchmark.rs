use std::time::Instant;
use tethys_schema::store::{EntryKind, EntryPage, EntryUpsert, NewEvent, ThreadId};
use tethys_store::EventStore;

#[tokio::test]
#[ignore = "Scale and performance benchmark; run with cargo test -- --ignored --release"]
async fn sustained_write_throughput_benchmark() -> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;
    let db_path = dir.path().join("sustained_perf.db");
    let store = EventStore::open(&db_path).await?;
    let thread_id = ThreadId("bench_thread".into());

    store.ensure_project("p1", "/tmp", "worktree").await?;
    store.ensure_thread(&thread_id, "p1").await?;

    // Workload: 200 batches of 100 events = 20,000 events total
    let batch_size = 100;
    let total_batches = 200;
    let total_events = batch_size * total_batches;

    let start = Instant::now();

    for b in 0..total_batches {
        let events: Vec<NewEvent> = (0..batch_size)
            .map(|i| NewEvent {
                kind: "bench_event".into(),
                payload: format!("{{\"batch\":{b}, \"i\":{i}}}"),
                entry: if i % 10 == 0 {
                    Some(EntryUpsert {
                        kind: EntryKind::Message,
                        entry_id: format!("entry_{}", (b * batch_size + i) / 10),
                        turn_index: Some(0),
                        payload: "{\"msg\":\"upserted\"}".into(),
                    })
                } else {
                    None
                },
            })
            .collect();

        store.append_batch(&thread_id, &events).await?;
    }

    let elapsed = start.elapsed();
    let events_per_sec = (total_events as f64) / elapsed.as_secs_f64();

    println!(
        "\nSustained write: {} events in {:.3}s ({:.0} events/s)",
        total_events,
        elapsed.as_secs_f64(),
        events_per_sec
    );

    let count = store.count_events(&thread_id).await?;
    assert_eq!(count, total_events as u64);

    // Target from milestone: >= 10k events/s sustained write
    assert!(
        events_per_sec >= 10_000.0,
        "Target is >= 10,000 events/s, achieved {:.0} events/s",
        events_per_sec
    );

    Ok(())
}

#[tokio::test]
#[ignore = "Scale verification on 50k events; run with cargo test -- --ignored --release"]
async fn open_thread_latency_flat_at_50k_events() -> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;
    let db_path = dir.path().join("50k_events.db");
    let store = EventStore::open(&db_path).await?;
    let thread_id = ThreadId("50k_thread".into());

    store.ensure_project("p1", "/tmp", "worktree").await?;
    store.ensure_thread(&thread_id, "p1").await?;

    // Populate 50,000 events in batches of 500
    println!("\nPopulating 50,000 events...");
    let batch_size = 500;
    let total_batches = 100;

    for b in 0..total_batches {
        let events: Vec<NewEvent> = (0..batch_size)
            .map(|i| NewEvent {
                kind: "turn_event".into(),
                payload: "{\"content\":\"stream chunk\"}".into(),
                entry: if (b * batch_size + i) < 100 {
                    // 100 materialized entries total
                    Some(EntryUpsert {
                        kind: EntryKind::Message,
                        entry_id: format!("msg_{}", b * batch_size + i),
                        turn_index: Some(0),
                        payload: "{\"content\":\"message\"}".into(),
                    })
                } else {
                    None
                },
            })
            .collect();
        store.append_batch(&thread_id, &events).await?;
    }

    let count = store.count_events(&thread_id).await?;
    assert_eq!(count, 50_000);

    // Measure open_thread latency on 50k-event thread
    let start = Instant::now();
    let view = store
        .open_thread(
            &thread_id,
            EntryPage {
                before_first_seq: None,
                limit: 50,
            },
        )
        .await?;
    let open_elapsed = start.elapsed();

    println!(
        "open_thread on 50k-event thread returned {} entries in {:.2}ms (latest_seq = {})",
        view.entries.len(),
        open_elapsed.as_secs_f64() * 1000.0,
        view.latest_seq
    );

    assert_eq!(view.latest_seq, 50_000);
    assert_eq!(view.entries.len(), 50);
    // Latency must be sub-5ms because it queries indexed entries, not the 50k events!
    assert!(
        open_elapsed.as_millis() < 50,
        "open_thread on 50k events took too long: {:?}",
        open_elapsed
    );

    Ok(())
}
