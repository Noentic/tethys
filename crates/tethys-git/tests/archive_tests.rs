mod common;

use common::{NoopSetupRunner, TestRepo};
use tethys_git::{GitEngine, GitError};
use tethys_schema::{CheckpointPhase, RestorePolicy, RestoreTarget, WorktreeInfo, WorktreeSpec};

struct Fixture {
    engine: GitEngine,
    root: std::path::PathBuf,
    info: WorktreeInfo,
}

fn create_worktree(repo: &TestRepo, holder: &tempfile::TempDir, slug: &str) -> Fixture {
    let path = holder.path().join(slug);
    let spec = WorktreeSpec {
        thread_id: slug.to_string(),
        project_root: repo.root.to_string_lossy().into_owned(),
        slug: slug.to_string(),
        path: path.to_string_lossy().into_owned(),
        branch: format!("tethys/{slug}"),
        base: "main".to_string(),
        bootstrap_globs: Vec::new(),
        setup_script: None,
        main_checkout: false,
    };
    let info = repo
        .engine()
        .worktree_create(&spec, &NoopSetupRunner::new())
        .expect("create worktree");
    let engine = GitEngine::open(&path).expect("open worktree engine");
    Fixture {
        engine,
        root: path,
        info,
    }
}

#[test]
fn delete_blocks_on_uncommitted_work_and_leases() {
    let repo = TestRepo::init();
    repo.write("pkg/a.txt", "one\n");
    repo.commit("base");
    let holder = tempfile::tempdir().expect("holder");
    let fixture = create_worktree(&repo, &holder, "blocked");

    std::fs::write(fixture.root.join("pkg/a.txt"), "dirty\n").expect("dirty file");
    let error = repo
        .engine()
        .worktree_delete(&fixture.info, false, false)
        .expect_err("uncommitted work blocks delete");
    match error {
        GitError::DeleteBlocked { uncommitted, .. } => {
            assert_eq!(uncommitted, vec!["pkg/a.txt".to_string()]);
        }
        other => panic!("expected DeleteBlocked, got {other:?}"),
    }

    let error = repo
        .engine()
        .worktree_delete(&fixture.info, true, true)
        .expect_err("active lease blocks delete");
    assert!(matches!(
        error,
        GitError::DeleteBlocked { leased: true, .. }
    ));

    repo.engine()
        .worktree_delete(&fixture.info, true, false)
        .expect("force delete removes the worktree");
    assert!(!fixture.root.exists());
}

#[test]
fn archive_moves_turn_refs_and_keeps_latest_restore_capture() {
    let repo = TestRepo::init();
    repo.write("pkg/a.txt", "one\n");
    repo.commit("base");
    let holder = tempfile::tempdir().expect("holder");
    let fixture = create_worktree(&repo, &holder, "archived");

    fixture
        .engine
        .checkpoint_create("archived", 1, CheckpointPhase::Start)
        .expect("start");
    std::fs::write(fixture.root.join("pkg/a.txt"), "two\n").expect("edit");
    fixture
        .engine
        .checkpoint_create("archived", 1, CheckpointPhase::End)
        .expect("end");
    for phase in [CheckpointPhase::Start, CheckpointPhase::End] {
        fixture
            .engine
            .restore(
                &RestoreTarget::Checkpoint {
                    thread_id: "archived".to_string(),
                    turn: 1,
                    phase,
                },
                RestorePolicy::Force,
            )
            .expect("restore creates an undo capture");
    }

    fixture
        .engine
        .worktree_archive("archived")
        .expect("archive refs");

    assert!(
        fixture
            .engine
            .checkpoint_list("archived")
            .expect("list")
            .is_empty(),
        "turn refs moved out of the checkpoint namespace"
    );
    let archived = repo.git(&["for-each-ref", "refs/tethys/archived/archived"]);
    assert!(
        archived.contains("1/start") && archived.contains("1/end"),
        "{archived}"
    );
    let restores = repo.git(&["for-each-ref", "refs/tethys/checkpoints/archived/restores"]);
    assert_eq!(
        restores.lines().count(),
        2,
        "latest capture keeps worktree and index refs"
    );
    assert!(fixture.root.is_dir(), "worktree is kept");
}

#[test]
fn deleting_a_worktree_removes_its_refs() {
    let repo = TestRepo::init();
    repo.write("pkg/a.txt", "one\n");
    repo.commit("base");
    let holder = tempfile::tempdir().expect("holder");
    let fixture = create_worktree(&repo, &holder, "clean");

    fixture
        .engine
        .checkpoint_create("clean", 1, CheckpointPhase::Start)
        .expect("start");

    repo.engine()
        .worktree_delete(&fixture.info, false, false)
        .expect("clean delete");

    assert!(!fixture.root.exists());
    let refs = repo.git(&["for-each-ref", "refs/tethys"]);
    assert!(refs.trim().is_empty(), "thread refs are pruned: {refs:?}");
    let branches = repo.git(&["branch", "--list", "tethys/clean"]);
    assert!(branches.trim().is_empty(), "branch deleted");
}
