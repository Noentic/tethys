mod common;

use common::TestRepo;
use tethys_git::{GitEngine, GitError, GitOptions};
use tethys_schema::{CheckpointPhase, RestorePolicy, RestoreTarget};

#[test]
fn checkpoints_work_in_linked_worktrees_without_touching_user_state() {
    let repo = TestRepo::init();
    repo.write("pkg/file.txt", "base\n");
    repo.commit("base");

    let linked_dir = tempfile::tempdir().expect("linked temp dir");
    let linked = linked_dir.path().join("wt");
    repo.git(&[
        "worktree",
        "add",
        "-b",
        "feat/linked",
        linked.to_str().expect("utf8 path"),
        "main",
    ]);
    std::fs::write(linked.join("pkg/file.txt"), "agent change\n").expect("modify linked file");

    let engine = GitEngine::open(&linked).expect("open linked engine");
    let result = engine
        .checkpoint_create("t-linked", 1, CheckpointPhase::Start)
        .expect("checkpoint in linked worktree");

    assert!(!result.commit_oid.is_empty());
    let status = repo.git_in(&linked, &["status", "--porcelain"]);
    assert!(
        status.starts_with(" M") || status.starts_with("M "),
        "user index should stay untouched, got: {status:?}"
    );
    let branch = repo.git_in(&linked, &["rev-parse", "--abbrev-ref", "HEAD"]);
    assert_eq!(branch.trim(), "feat/linked");
}

#[test]
fn restore_then_undo_restore_returns_identical_tree() {
    let repo = TestRepo::init();
    repo.write("pkg/a.txt", "one\n");
    repo.commit("base");
    let engine = repo.engine();

    engine
        .checkpoint_create("t1", 1, CheckpointPhase::Start)
        .expect("start checkpoint");
    repo.write("pkg/a.txt", "two\n");
    repo.write("pkg/b.txt", "bee\n");
    engine
        .checkpoint_create("t1", 1, CheckpointPhase::End)
        .expect("end checkpoint");

    repo.write("pkg/a.txt", "three\n");
    repo.remove("pkg/b.txt");
    let before_restore = engine
        .checkpoint_create("t1", 9, CheckpointPhase::End)
        .expect("capture pre-restore state");

    let outcome = engine
        .restore(
            &RestoreTarget::Checkpoint {
                thread_id: "t1".to_string(),
                turn: 1,
                phase: CheckpointPhase::Start,
            },
            RestorePolicy::Force,
        )
        .expect("restore to start");
    assert_eq!(repo.read("pkg/a.txt"), "one\n");
    assert!(!repo.exists("pkg/b.txt"));

    engine
        .restore(
            &RestoreTarget::Trees {
                thread_id: "t1".to_string(),
                worktree_tree: outcome.undo.worktree_tree.clone(),
                index_tree: outcome.undo.index_tree.clone(),
            },
            RestorePolicy::Force,
        )
        .expect("undo restore");
    assert_eq!(repo.read("pkg/a.txt"), "three\n");
    assert!(!repo.exists("pkg/b.txt"));

    let after_undo = engine
        .checkpoint_create("t1", 10, CheckpointPhase::End)
        .expect("capture after undo");
    assert_eq!(
        after_undo.tree_oid, before_restore.tree_oid,
        "undo restore must reproduce the exact tree hash"
    );
}

#[test]
fn restore_removes_tracked_additions_and_keeps_untracked() {
    let repo = TestRepo::init();
    repo.write("pkg/a.txt", "one\n");
    repo.commit("base");
    let engine = repo.engine();

    engine
        .checkpoint_create("t1", 1, CheckpointPhase::Start)
        .expect("start");
    repo.write("pkg/a.txt", "two\n");
    repo.write("pkg/b.txt", "bee\n");
    engine
        .checkpoint_create("t1", 1, CheckpointPhase::End)
        .expect("end");

    repo.write("pkg/a.txt", "three\n");
    repo.git(&["add", "pkg/a.txt"]);
    repo.write("pkg/c.txt", "untracked\n");

    engine
        .restore(
            &RestoreTarget::Checkpoint {
                thread_id: "t1".to_string(),
                turn: 1,
                phase: CheckpointPhase::End,
            },
            RestorePolicy::Force,
        )
        .expect("restore to end");

    assert_eq!(repo.read("pkg/a.txt"), "two\n");
    assert_eq!(repo.read("pkg/b.txt"), "bee\n");
    assert!(repo.exists("pkg/c.txt"), "untracked files must survive");
    let status = repo.git(&["status", "--porcelain"]);
    assert!(
        status.contains("M  pkg/a.txt"),
        "index restores to target: {status:?}"
    );
    assert!(
        status.contains("A  pkg/b.txt"),
        "index restores to target: {status:?}"
    );
    assert!(
        status.contains("?? pkg/c.txt"),
        "untracked stays untracked: {status:?}"
    );
    assert_eq!(
        status.lines().count(),
        3,
        "no stale staged content: {status:?}"
    );
}

#[test]
fn require_clean_policy_refuses_divergent_state() {
    let repo = TestRepo::init();
    repo.write("pkg/a.txt", "one\n");
    repo.commit("base");
    let engine = repo.engine();

    engine
        .checkpoint_create("t1", 1, CheckpointPhase::Start)
        .expect("start");
    repo.write("pkg/a.txt", "two\n");
    engine
        .checkpoint_create("t1", 1, CheckpointPhase::End)
        .expect("end");

    repo.git(&["add", "-A"]);
    engine
        .restore(
            &RestoreTarget::Checkpoint {
                thread_id: "t1".to_string(),
                turn: 1,
                phase: CheckpointPhase::End,
            },
            RestorePolicy::RequireClean,
        )
        .expect("clean state restores");

    repo.write("pkg/a.txt", "three\n");
    let error = engine
        .restore(
            &RestoreTarget::Checkpoint {
                thread_id: "t1".to_string(),
                turn: 1,
                phase: CheckpointPhase::End,
            },
            RestorePolicy::RequireClean,
        )
        .expect_err("divergent state must be refused");
    assert!(
        matches!(error, GitError::RestoreBlocked(_)),
        "got {error:?}"
    );

    engine
        .restore(
            &RestoreTarget::Checkpoint {
                thread_id: "t1".to_string(),
                turn: 1,
                phase: CheckpointPhase::End,
            },
            RestorePolicy::Force,
        )
        .expect("force restores");
}

#[test]
fn checkpoints_skip_large_untracked_binaries_and_keep_them_on_disk() {
    let repo = TestRepo::init();
    repo.write("pkg/small.txt", "hello\n");
    repo.commit("base");
    let engine = GitEngine::open_with(
        &repo.root,
        GitOptions {
            skip_untracked_binary_bytes: 1024,
        },
    )
    .expect("open engine");

    let mut binary = vec![7u8; 4096];
    binary[10] = 0;
    repo.write_bytes("pkg/blob.bin", &binary);

    let result = engine
        .checkpoint_create("t1", 1, CheckpointPhase::Start)
        .expect("checkpoint");
    assert_eq!(result.skipped, vec!["pkg/blob.bin".to_string()]);

    let listed = repo.git(&["ls-tree", "-r", "--name-only", &result.tree_oid]);
    assert!(listed.contains("small.txt"));
    assert!(!listed.contains("blob.bin"));

    engine
        .restore(
            &RestoreTarget::Checkpoint {
                thread_id: "t1".to_string(),
                turn: 1,
                phase: CheckpointPhase::Start,
            },
            RestorePolicy::Force,
        )
        .expect("restore");
    assert!(repo.exists("pkg/blob.bin"), "skipped files stay on disk");
}

#[test]
fn list_orders_turns_and_hides_restore_captures() {
    let repo = TestRepo::init();
    repo.write("pkg/a.txt", "one\n");
    repo.commit("base");
    let engine = repo.engine();

    engine
        .checkpoint_create("t1", 1, CheckpointPhase::Start)
        .expect("start 1");
    engine
        .checkpoint_create("t1", 1, CheckpointPhase::End)
        .expect("end 1");
    engine
        .checkpoint_create("t1", 2, CheckpointPhase::Start)
        .expect("start 2");

    repo.write("pkg/a.txt", "two\n");
    engine
        .restore(
            &RestoreTarget::Checkpoint {
                thread_id: "t1".to_string(),
                turn: 1,
                phase: CheckpointPhase::End,
            },
            RestorePolicy::Force,
        )
        .expect("restore creates an undo capture");

    let listed = engine.checkpoint_list("t1").expect("list");
    let turns: Vec<(u32, CheckpointPhase)> =
        listed.iter().map(|info| (info.turn, info.phase)).collect();
    assert_eq!(
        turns,
        vec![
            (1, CheckpointPhase::Start),
            (1, CheckpointPhase::End),
            (2, CheckpointPhase::Start),
        ]
    );
}
