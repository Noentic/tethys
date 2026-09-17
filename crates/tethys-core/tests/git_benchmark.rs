use std::fs::{self, File};
use std::io::Write;
use std::process::Command;
use std::time::Instant;
use tethys_core::git::GitEngine;

#[test]
fn test_worktree_checkpoint_snapshot_benchmark_100k_files() {
    let tmp_repo = std::env::temp_dir().join(format!("tethys_git_bench_{}", std::process::id()));
    if tmp_repo.exists() {
        let _ = fs::remove_dir_all(&tmp_repo);
    }
    fs::create_dir_all(&tmp_repo).expect("create temp repo dir");

    // 1. Git init
    assert!(Command::new("git")
        .current_dir(&tmp_repo)
        .args(["init", "-q"])
        .status()
        .unwrap()
        .success());
    assert!(Command::new("git")
        .current_dir(&tmp_repo)
        .args(["config", "user.name", "Tethys Test"])
        .status()
        .unwrap()
        .success());
    assert!(Command::new("git")
        .current_dir(&tmp_repo)
        .args(["config", "user.email", "test@tethys.dev"])
        .status()
        .unwrap()
        .success());

    // 2. Generate 100k files
    let seed_path = tmp_repo.join("seed.txt");
    {
        let mut f = File::create(&seed_path).expect("create seed");
        writeln!(f, "initial version").expect("write seed");
    }

    let t_gen = Instant::now();
    let num_dirs = 50;
    let files_per_dir = 2000;
    for d in 0..num_dirs {
        let subdir = tmp_repo.join(format!("pkg_{d:02}"));
        fs::create_dir_all(&subdir).expect("create subdir");
        for f in 0..files_per_dir {
            let target = subdir.join(format!("file_{f:04}.txt"));
            fs::hard_link(&seed_path, target).expect("hardlink");
        }
    }
    println!("Generated 100k files in {:.2?}", t_gen.elapsed());

    // 3. Initial commit as HEAD
    assert!(Command::new("git")
        .current_dir(&tmp_repo)
        .args(["add", "-A"])
        .status()
        .unwrap()
        .success());
    assert!(Command::new("git")
        .current_dir(&tmp_repo)
        .args(["commit", "-q", "-m", "initial repository commit"])
        .status()
        .unwrap()
        .success());

    // 4. Perform typical agent turn modifications:
    // Modify 5 files, add 2 new files, delete 1 file
    let mut changed_paths = Vec::new();
    for i in 0..5 {
        let rel = format!("pkg_00/file_{i:04}.txt");
        let path = tmp_repo.join(&rel);
        let _ = fs::remove_file(&path);
        fs::write(&path, format!("agent turn modification {i}")).expect("modify file");
        changed_paths.push(rel);
    }
    fs::write(tmp_repo.join("pkg_00/new_file_1.txt"), "new 1").expect("add file 1");
    changed_paths.push("pkg_00/new_file_1.txt".into());
    fs::write(tmp_repo.join("pkg_00/new_file_2.txt"), "new 2").expect("add file 2");
    changed_paths.push("pkg_00/new_file_2.txt".into());
    let _ = fs::remove_file(tmp_repo.join("pkg_00/file_0010.txt"));
    changed_paths.push("pkg_00/file_0010.txt".into());

    // 5. Benchmark temp-index checkpoint snapshot
    let thread_id = "thread_bench_01";
    let turn_index = 1;

    let res = GitEngine::create_checkpoint(
        &tmp_repo,
        thread_id,
        turn_index,
        None,
        Some(&changed_paths),
    )
    .expect("create_checkpoint failed");

    println!("=== S0.4 Worktree & Checkpoint Benchmark Results ===");
    println!("Commit OID: {}", res.commit_oid);
    println!("Checkpoint Ref: {}", res.ref_name);
    println!(
        "Snapshot Latency: {:.2} ms (Target: <= 1,000 ms)",
        res.elapsed_ms
    );

    assert!(!res.commit_oid.is_empty());
    assert!(
        res.elapsed_ms <= 1000.0,
        "Snapshot latency {:.2} ms exceeded the <= 1,000 ms target",
        res.elapsed_ms
    );

    // 6. Verify checkpoint diff captures the modifications
    let diff = GitEngine::get_checkpoint_diff(&tmp_repo, "HEAD", &res.commit_oid)
        .expect("get diff failed");
    assert!(diff.contains("agent turn modification"));
    assert!(diff.contains("new_file_1.txt"));

    // 7. Verify restore checkpoint restores modified file
    let test_file = tmp_repo.join("pkg_00/file_0000.txt");
    assert_eq!(
        fs::read_to_string(&test_file).unwrap(),
        "agent turn modification 0"
    );

    // Restore to HEAD
    GitEngine::restore_checkpoint(&tmp_repo, "HEAD").expect("restore to HEAD failed");
    assert_eq!(
        fs::read_to_string(&test_file).unwrap(),
        "initial version\n"
    );

    // Cleanup
    let _ = fs::remove_dir_all(&tmp_repo);
}
