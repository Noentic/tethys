//! Benchmark: warm query latency on a 200k-file worktree (M1.5 exit criterion).
//!
//! Run manually in release; never part of `cargo test`:
//! `cargo bench -p tethys-search`
//!
//! Generates the tree with hard links (cheap, no disk duplication), waits for
//! the initial scan, then reports average and p95 over warm queries.

use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use tethys_search::WorktreeSearchIndex;

const FILES: usize = 200_000;
const DIRS: usize = 100;
const SEEDS: usize = 16;
const WARM_QUERIES: usize = 200;

fn build_tree(root: &PathBuf) {
    let _ = fs::remove_dir_all(root);
    fs::create_dir_all(root).expect("create bench root");

    // Several seeds keep each file's link count well under the ext4 EMLINK cap.
    let per_seed = FILES / SEEDS;
    for seed in 0..SEEDS {
        let seed_path = root.join(format!("seed_{seed:02}.txt"));
        fs::write(&seed_path, "tethys bench seed\n").expect("seed");
    }

    let per_dir = FILES / DIRS;
    for dir in 0..DIRS {
        let subdir = root.join(format!("module_{dir:03}"));
        fs::create_dir_all(&subdir).expect("create module dir");
        for file in 0..per_dir {
            let seed_path = root.join(format!("seed_{:02}.txt", (dir * per_dir + file) / per_seed));
            let name = format!("component_{dir:03}_{file:05}.rs");
            fs::hard_link(&seed_path, subdir.join(name)).expect("hard link");
        }
    }
}

fn percentile(sorted: &[u128], fraction: f64) -> u128 {
    if sorted.is_empty() {
        return 0;
    }
    let index = ((sorted.len() as f64 - 1.0) * fraction).round() as usize;
    sorted[index]
}

fn main() {
    let root = std::env::temp_dir().join("tethys_warm_query_200k");
    eprintln!("building {FILES} hard links under {}", root.display());
    let build = Instant::now();
    build_tree(&root);
    eprintln!("tree ready in {:?}", build.elapsed());

    let index = WorktreeSearchIndex::open(&root).expect("open index");
    assert!(
        index.wait_ready(Duration::from_secs(120)),
        "initial scan did not finish"
    );

    let queries = [
        "component_042",
        "module_007",
        "component_099_19999",
        "module_050/com",
        "seed",
    ];

    for query in queries {
        let _ = index.query(query, 50).expect("warmup query");
    }

    let mut samples = Vec::with_capacity(WARM_QUERIES);
    for i in 0..WARM_QUERIES {
        let query = queries[i % queries.len()];
        let start = Instant::now();
        let results = index.query(query, 50).expect("query");
        let elapsed = start.elapsed();
        if i == 0 {
            eprintln!("first warm query returned {} items", results.len());
        }
        samples.push(elapsed.as_nanos());
    }

    samples.sort_unstable();
    let average = samples.iter().sum::<u128>() / samples.len() as u128;
    println!(
        "warm query on {FILES} files: avg {:.3} ms, p95 {:.3} ms (n={WARM_QUERIES})",
        average as f64 / 1e6,
        percentile(&samples, 0.95) as f64 / 1e6,
    );

    let _ = fs::remove_dir_all(&root);
}
