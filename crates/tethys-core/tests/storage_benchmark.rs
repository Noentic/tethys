use std::fs;
use std::time::Instant;
use tethys_core::storage::EventStore;

#[test]
fn test_sqlite_wal_event_log_throughput_and_replay() {
    let tmp_db = std::env::temp_dir().join(format!("tethys_bench_{}.db", std::process::id()));
    if tmp_db.exists() {
        let _ = fs::remove_file(&tmp_db);
    }

    let mut store = EventStore::open(&tmp_db).expect("open sqlite event store");
    let thread_id = "thread_bench_store_01";
    let total_events = 20_000;

    // Prepare 20,000 events in memory
    let sample_payload = "{\"role\":\"agent\",\"content\":[{\"kind\":\"Text\",\"text\":\"Generating optimized solution for user request\"}]}";
    let mut batch = Vec::with_capacity(total_events);
    for seq in 0..total_events {
        batch.push((seq as u32, "message_chunk", sample_payload));
    }

    // 1. Benchmark batch write throughput
    let t_write = Instant::now();
    let write_elapsed_ms = store
        .append_batch(thread_id, &batch)
        .expect("append batch failed");
    let total_write_time = t_write.elapsed();
    let write_throughput = (total_events as f64) / total_write_time.as_secs_f64();

    assert_eq!(store.count_events(thread_id).unwrap(), total_events);

    // 2. Benchmark replay read throughput
    let t_read = Instant::now();
    let replayed = store
        .read_events(thread_id, 0, total_events)
        .expect("read events failed");
    let read_elapsed = t_read.elapsed();
    let read_elapsed_ms = read_elapsed.as_secs_f64() * 1000.0;
    let read_throughput = (replayed.len() as f64) / read_elapsed.as_secs_f64();

    assert_eq!(replayed.len(), total_events);

    println!("=== S0.8 SQLite WAL Event Store Benchmark Results ===");
    println!("Database: {}", tmp_db.display());
    println!("Total Events: {}", total_events);
    println!("Write Transaction Time: {:.2} ms", write_elapsed_ms);
    println!(
        "Write Throughput: {:.0} events/s (Target: >= 10,000 events/s)",
        write_throughput
    );
    println!("Replay Read Latency: {:.2} ms", read_elapsed_ms);
    println!(
        "Replay Throughput: {:.0} events/s",
        read_throughput
    );

    assert!(
        write_throughput >= 10_000.0,
        "Write throughput {:.0} was below the >= 10,000 target",
        write_throughput
    );
    assert!(
        read_elapsed_ms <= 100.0,
        "Replay latency {:.2} ms exceeded the <= 100 ms target",
        read_elapsed_ms
    );

    let _ = fs::remove_file(&tmp_db);
}
