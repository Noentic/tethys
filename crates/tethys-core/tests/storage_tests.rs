use std::fs;
use tethys_core::storage::EventStore;

struct AutoCleanDb(std::path::PathBuf);
impl Drop for AutoCleanDb {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
        let _ = fs::remove_file(self.0.with_extension("db-wal"));
        let _ = fs::remove_file(self.0.with_extension("db-shm"));
    }
}

#[test]
fn test_sqlite_event_log_append_and_replay() {
    let tmp_db = std::env::temp_dir().join(format!("tethys_storage_test_{}.db", std::process::id()));
    if tmp_db.exists() {
        let _ = fs::remove_file(&tmp_db);
    }
    let _cleaner = AutoCleanDb(tmp_db.clone());

    let mut store = EventStore::open(&tmp_db).expect("open sqlite event store");
    let thread_id = "thread_storage_test_01";

    let batch = vec![
        (0, "message_chunk", "{\"content\":\"hello\"}"),
        (1, "message_chunk", "{\"content\":\"world\"}"),
    ];

    store.append_batch(thread_id, &batch).expect("append batch failed");
    assert_eq!(store.count_events(thread_id).unwrap(), 2);

    let events = store.read_events(thread_id, 0, 10).expect("read events failed");
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].seq, 0);
    assert_eq!(events[0].event_type, "message_chunk");
    assert_eq!(events[1].seq, 1);
}
