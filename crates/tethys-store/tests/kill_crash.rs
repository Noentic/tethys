use std::env;
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;
use tethys_schema::store::{NewEvent, ThreadId};
use tethys_store::EventStore;

const CHILD_FLAG: &str = "__TETHYS_CRASH_CHILD";

#[test]
#[ignore = "Heavy stress test involving SIGKILL subprocess; run with cargo test -- --ignored --release"]
fn test_real_sigkill_mid_write_leaves_no_torn_state() {
    if env::var(CHILD_FLAG).is_ok() {
        // Child writer process
        let db_path = env::var("__TETHYS_CRASH_DB").expect("DB path env var");
        let rt = tokio::runtime::Runtime::new().expect("create tokio runtime");
        rt.block_on(async {
            let store = EventStore::open(&db_path).await.expect("open store");
            let tid = ThreadId("child_thread".into());

            // Loop appending batches continuously until killed
            let mut batch_idx = 0;
            loop {
                let events: Vec<NewEvent> = (0..50)
                    .map(|i| NewEvent {
                        kind: "continuous".into(),
                        payload: format!("{{\"batch\":{batch_idx}, \"i\":{i}}}"),
                        entry: None,
                    })
                    .collect();
                let _ = store.append_batch(&tid, &events).await;
                batch_idx += 1;
            }
        });
        return;
    }

    // Parent supervisor process
    let dir = tempfile::tempdir().expect("create tempdir");
    let db_path = dir.path().join("kill_crash.db");

    let rt = tokio::runtime::Runtime::new().expect("runtime");
    rt.block_on(async {
        let store = EventStore::open(&db_path).await.expect("init store");
        store.ensure_project("p1", "/tmp", "worktree").await.unwrap();
        store.ensure_thread(&ThreadId("child_thread".into()), "p1").await.unwrap();
    });

    let current_exe = env::current_exe().expect("current test exe");
    let mut child = Command::new(&current_exe)
        .arg("test_real_sigkill_mid_write_leaves_no_torn_state")
        .arg("--exact")
        .arg("--ignored")
        .env(CHILD_FLAG, "1")
        .env("__TETHYS_CRASH_DB", db_path.to_str().unwrap())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn child process");

    // Let the child write some batches
    thread::sleep(Duration::from_millis(200));

    // Force kill with SIGKILL
    let _ = child.kill();
    let _ = child.wait();

    // Reopen in parent
    rt.block_on(async {
        let store = EventStore::open(&db_path).await.expect("reopen store after kill");
        let tid = ThreadId("child_thread".into());

        let count = store.count_events(&tid).await.expect("count events");
        // Each batch wrote exactly 50 events; count must be an exact multiple of 50
        assert_eq!(
            count % 50,
            0,
            "Partial batch detected! Event count {count} is not a multiple of 50"
        );

        let conn = rusqlite::Connection::open(&db_path).expect("open raw sqlite");
        let integrity: String = conn
            .query_row("PRAGMA integrity_check;", [], |r| r.get(0))
            .expect("integrity check");
        assert_eq!(integrity, "ok", "Database file must be intact");

        let latest_seq: i64 = conn
            .query_row(
                "SELECT latest_seq FROM threads WHERE id = 'child_thread'",
                [],
                |r| r.get(0),
            )
            .expect("query latest_seq");
        assert_eq!(
            latest_seq as u64, count,
            "latest_seq must match total committed events"
        );
    });
}
