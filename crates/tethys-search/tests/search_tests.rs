use std::fs;
use std::time::Duration;

use tempfile::TempDir;
use tethys_search::{SearchError, SearchIndexManager, WARM_DEADLINE};

const READY_TIMEOUT: Duration = Duration::from_secs(10);

fn tree() -> TempDir {
    tempfile::tempdir().expect("temp dir")
}

#[test]
fn query_returns_files_and_folders() {
    let dir = tree();
    fs::create_dir_all(dir.path().join("src/components")).expect("dirs");
    fs::write(dir.path().join("src/main.rs"), "fn main() {}\n").expect("main");
    fs::write(dir.path().join("config.json"), "{}\n").expect("config");

    let manager = SearchIndexManager::new();
    assert!(manager.wait_ready(dir.path(), READY_TIMEOUT).expect("open"));

    let files = manager.query(dir.path(), "main", 10).expect("query");
    let matched_file = files
        .iter()
        .find(|item| item.relative_path.contains("main.rs"))
        .expect("main.rs in results");
    assert!(!matched_file.is_dir);

    let folders = manager.query(dir.path(), "components", 10).expect("query");
    assert!(
        folders
            .iter()
            .any(|item| item.relative_path.contains("components") && item.is_dir),
        "expected the components directory with is_dir == true, got {folders:?}"
    );
}

#[test]
fn roots_are_isolated() {
    let first = tree();
    let second = tree();
    fs::write(first.path().join("alpha-only.txt"), "a").expect("a");
    fs::write(second.path().join("beta-only.txt"), "b").expect("b");

    let manager = SearchIndexManager::new();
    assert!(manager
        .wait_ready(first.path(), READY_TIMEOUT)
        .expect("open"));
    assert!(manager
        .wait_ready(second.path(), READY_TIMEOUT)
        .expect("open"));

    let from_first = manager.query(first.path(), "beta-only", 10).expect("query");
    let from_second = manager
        .query(second.path(), "beta-only", 10)
        .expect("query");
    assert!(from_first.is_empty(), "results leaked across roots");
    assert!(from_second
        .iter()
        .any(|i| i.relative_path.contains("beta-only")));
}

#[test]
fn invalidate_refreshes_after_churn() {
    let dir = tree();
    fs::write(dir.path().join("original.txt"), "x").expect("original");

    let manager = SearchIndexManager::new();
    assert!(manager.wait_ready(dir.path(), READY_TIMEOUT).expect("open"));
    let before = manager.query(dir.path(), "original", 10).expect("query");
    assert!(!before.is_empty());

    fs::write(dir.path().join("fresh.txt"), "y").expect("fresh");
    manager.invalidate(dir.path()).expect("invalidate");

    assert!(manager
        .wait_ready(dir.path(), READY_TIMEOUT)
        .expect("rescan"));
    let after = manager.query(dir.path(), "fresh", 10).expect("query");
    assert!(
        after.iter().any(|i| i.relative_path.contains("fresh.txt")),
        "rescanned index did not see the new file: {after:?}"
    );
}

#[test]
fn dropped_index_rebuilds() {
    let dir = tree();
    fs::write(dir.path().join("original.txt"), "x").expect("original");

    let manager = SearchIndexManager::new();
    assert!(manager.wait_ready(dir.path(), READY_TIMEOUT).expect("open"));

    fs::write(dir.path().join("fresh.txt"), "y").expect("fresh");
    manager.drop_index(dir.path());

    assert!(manager
        .wait_ready(dir.path(), READY_TIMEOUT)
        .expect("reopen"));
    let after = manager.query(dir.path(), "fresh", 10).expect("query");
    assert!(
        after.iter().any(|i| i.relative_path.contains("fresh.txt")),
        "rebuilt index did not see the new file: {after:?}"
    );
}

#[test]
fn cold_query_returns_results_or_warming() {
    let dir = tree();
    fs::write(dir.path().join("cold.txt"), "z").expect("cold");

    let manager = SearchIndexManager::new();
    match manager.query(dir.path(), "cold", 10) {
        Ok(items) => assert!(items.iter().all(|i| i.relative_path.contains("cold"))),
        Err(SearchError::IndexWarming { .. }) => {}
        Err(other) => panic!("unexpected error: {other}"),
    }
    assert!(
        WARM_DEADLINE < Duration::from_secs(1),
        "command path must not stall"
    );
}
