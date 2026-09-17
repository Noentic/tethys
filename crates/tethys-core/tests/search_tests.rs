use std::fs;
use tethys_core::search::WorktreeSearchIndex;

struct AutoCleanDir(std::path::PathBuf);
impl Drop for AutoCleanDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn test_search_file_index_and_query() {
    let tmp_dir = std::env::temp_dir().join(format!("tethys_search_test_{}", std::process::id()));
    if tmp_dir.exists() {
        let _ = fs::remove_dir_all(&tmp_dir);
    }
    fs::create_dir_all(tmp_dir.join("src")).expect("failed to create temp dir");
    let _cleanup = AutoCleanDir(tmp_dir.clone());

    fs::write(tmp_dir.join("src/main.rs"), "fn main() {}\n").unwrap();
    fs::write(tmp_dir.join("src/lib.rs"), "pub fn run() {}\n").unwrap();
    fs::write(tmp_dir.join("config.json"), "{\"name\":\"tethys\"}\n").unwrap();
    fs::write(tmp_dir.join("README.md"), "# Tethys\n").unwrap();

    let index = WorktreeSearchIndex::open(&tmp_dir).expect("failed to open search index");

    let results = index.query("main", 10).expect("query failed");
    assert!(!results.is_empty(), "expected matching results for 'main'");
    assert!(results.iter().any(|r| r.relative_path.contains("main.rs")));

    let results_config = index.query("config", 10).expect("query failed");
    assert!(!results_config.is_empty(), "expected matching results for 'config'");
    assert!(results_config.iter().any(|r| r.relative_path.contains("config.json")));
}
