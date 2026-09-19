//! Milestone criterion: checkpoint p95 ≤ 1 s on a 100k-file repository.
//!
//! Run manually (never in CI):
//! `cargo bench -p tethys-git --bench checkpoint_100k -- --files 100000`
//!
//! Generates the repo in a temp dir, commits it, then measures 20 checkpoints.
//! The p95 is printed and the process exits non-zero when the criterion fails.

use std::fmt::Write as _;
use std::path::Path;
use std::process::Command;
use std::time::Instant;

use tethys_git::GitEngine;
use tethys_schema::CheckpointPhase;

const RUNS: usize = 20;
const BUDGET_MS: f64 = 1000.0;

fn main() {
    let files = parse_files_arg().unwrap_or(100_000);
    let dir = tempfile::tempdir().expect("temp dir");
    let root = dir.path().to_path_buf();

    generate_repo(&root, files);
    let engine = GitEngine::open(&root).expect("open repo");

    engine
        .checkpoint_create("bench-warmup", 0, CheckpointPhase::Start)
        .expect("warmup checkpoint");

    let mut samples = Vec::with_capacity(RUNS);
    for index in 0..RUNS {
        let path = root
            .join("pkg")
            .join(format!("dir-{}", index % 256))
            .join(format!("file-{}.txt", (index * 97) % files));
        std::fs::write(&path, format!("bench iteration {index}\n")).expect("touch file");
        let started = Instant::now();
        let result = engine
            .checkpoint_create("bench", index as u32 + 1, CheckpointPhase::End)
            .expect("checkpoint");
        assert!(!result.commit_oid.is_empty());
        samples.push(started.elapsed().as_secs_f64() * 1000.0);
    }

    samples.sort_by(f64::total_cmp);
    let p50 = samples[samples.len() / 2];
    let p95 = samples[(samples.len() * 95 / 100).min(samples.len() - 1)];
    let max = samples[samples.len() - 1];

    let mut report = String::new();
    let _ = writeln!(report, "repo: {files} files under {}", root.display());
    let _ = writeln!(
        report,
        "checkpoints: {RUNS} · p50 {p50:.0} ms · p95 {p95:.0} ms · max {max:.0} ms"
    );
    let _ = writeln!(report, "budget: p95 ≤ {BUDGET_MS:.0} ms");
    print!("{report}");

    if p95 > BUDGET_MS {
        eprintln!("FAIL: p95 {p95:.0} ms exceeds budget");
        std::process::exit(1);
    }
    println!("PASS");
}

fn parse_files_arg() -> Option<usize> {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--files" {
            return args.next().and_then(|value| value.parse().ok());
        }
        if let Some(value) = arg.strip_prefix("--files=") {
            return value.parse().ok();
        }
    }
    None
}

fn generate_repo(root: &Path, files: usize) {
    run(root, &["init", "-q", "-b", "main"]);
    run(root, &["config", "user.name", "Tethys Bench"]);
    run(root, &["config", "user.email", "bench@tethys.dev"]);
    for dir in 0..256 {
        std::fs::create_dir_all(root.join("pkg").join(format!("dir-{dir}"))).expect("create dir");
    }
    for index in 0..files {
        let dir = root.join("pkg").join(format!("dir-{}", index % 256));
        std::fs::write(
            dir.join(format!("file-{index}.txt")),
            format!("line one for {index}\nline two\n"),
        )
        .expect("write file");
    }
    run(root, &["add", "-A"]);
    run(root, &["commit", "-q", "-m", "bench base"]);
}

fn run(cwd: &Path, args: &[&str]) {
    let output = Command::new("git")
        .current_dir(cwd)
        .args(args)
        .output()
        .expect("run git");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}
