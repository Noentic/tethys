use std::fs;
use std::time::Instant;
use tethys_core::search::WorktreeSearchIndex;

struct AutoCleanDir(std::path::PathBuf);
impl Drop for AutoCleanDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
#[ignore = "benchmark"]
fn test_search_warm_query_on_200k_files() {
    let tmp_dir = std::env::temp_dir().join(format!("tethys_search_bench_{}", std::process::id()));
    if tmp_dir.exists() {
        let _ = fs::remove_dir_all(&tmp_dir);
    }
    fs::create_dir_all(&tmp_dir).expect("failed to create temp dir");
    let _cleanup = AutoCleanDir(tmp_dir.clone());

    // Use batched seeds (max 500 links each) to prevent hitting filesystem link limits
    // (NTFS max is 1024, ext4 max is 65000).
    let start_gen = Instant::now();
    let num_dirs = 100;
    let files_per_dir = 2000;
    let mut total_files = 0;

    for d in 0..num_dirs {
        let subdir = tmp_dir.join(format!("dir_{d:03}"));
        fs::create_dir_all(&subdir).expect("failed to create subdir");
        let mut batch_seed = None;
        for f in 0..files_per_dir {
            let target = subdir.join(format!("component_{f:04}.rs"));
            if f % 500 == 0 {
                fs::write(&target, "// synthetic file content\n").expect("failed to write file");
                batch_seed = Some(target);
            } else if let Some(ref seed) = batch_seed {
                fs::hard_link(seed, target).expect("failed to hard link file");
            }
            total_files += 1;
        }
    }
    println!(
        "Generated {total_files} files in {:.2?}",
        start_gen.elapsed()
    );

    let start_index = Instant::now();
    let index = WorktreeSearchIndex::open(&tmp_dir).expect("failed to open search index");
    println!("Indexed {total_files} files in {:.2?}", start_index.elapsed());

    // Warm-up query
    let _ = index.query("component", 10).expect("warmup query failed");

    // Benchmark warm queries
    let test_queries = [
        "component_0042",
        "dir_050/component",
        "component_1999",
        "dir_099",
        "comp_0500",
    ];

    let mut latencies = Vec::new();
    for q in test_queries {
        let t0 = Instant::now();
        let results = index.query(q, 20).expect("query failed");
        let elapsed = t0.elapsed();
        latencies.push(elapsed);
        println!(
            "Query '{}' -> {} results in {:.3} ms",
            q,
            results.len(),
            elapsed.as_secs_f64() * 1000.0
        );
        assert!(!results.is_empty(), "query should match files");
        if !cfg!(debug_assertions) {
            assert!(
                elapsed.as_millis() <= 30,
                "Query '{q}' took {:?}, exceeding the <= 30ms exit criteria!",
                elapsed
            );
        }
    }

    let avg_latency: f64 = latencies.iter().map(|d| d.as_secs_f64() * 1000.0).sum::<f64>()
        / latencies.len() as f64;
    println!(
        "Average warm query latency: {:.2} ms (Target: <= 30 ms)",
        avg_latency
    );

    let _ = fs::remove_dir_all(&tmp_dir);
}
