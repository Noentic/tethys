use std::path::PathBuf;
use std::process::Command;

use tethys_api::{ApiError, TethysApi};
use tethys_core::{Core, ThreadRuntimeState};
use tethys_schema::{CheckpointPhase, DiffSource, RestorePolicy, RestoreTarget, WorktreeSpec};

struct Fixture {
    _dir: tempfile::TempDir,
    root: PathBuf,
    worktrees: tempfile::TempDir,
}

impl Fixture {
    fn init() -> Self {
        let dir = tempfile::tempdir().expect("repo dir");
        let root = dir.path().to_path_buf();
        std::fs::create_dir_all(root.join("pkg")).expect("pkg dir");
        git(&root, &["init", "-q", "-b", "main"]);
        git(&root, &["config", "core.autocrlf", "false"]);
        git(&root, &["config", "user.name", "Tethys Test"]);
        git(&root, &["config", "user.email", "test@tethys.dev"]);
        std::fs::write(root.join("pkg/a.txt"), "one\n").expect("write file");
        git(&root, &["add", "-A"]);
        git(&root, &["commit", "-q", "-m", "base"]);
        let worktrees = tempfile::tempdir().expect("worktree dir");
        std::fs::create_dir_all(root.join(".tethys")).expect(".tethys dir");
        std::fs::write(
            root.join(".tethys/config.json"),
            format!(
                r#"{{"git": {{"worktrees_dir": {:?}}}}}"#,
                worktrees.path().to_string_lossy()
            ),
        )
        .expect("git config");
        Self {
            _dir: dir,
            root,
            worktrees,
        }
    }

    fn spec(&self, thread: &str) -> WorktreeSpec {
        WorktreeSpec {
            thread_id: thread.to_string(),
            workspace_id: self.root.to_string_lossy().into_owned().into(),
            slug: thread.to_string(),
            path: self
                .worktrees
                .path()
                .join(thread)
                .to_string_lossy()
                .into_owned(),
            branch: String::new(),
            base: "main".to_string(),
            bootstrap_globs: Vec::new(),
            setup_script: None,
            main_checkout: false,
        }
    }

    fn core(&self) -> Core {
        let roots = tethys_core::StaticWorkspaces::new();
        roots.insert(self.root.to_string_lossy().into_owned(), &self.root);
        Core::new("test").with_workspace_roots(std::sync::Arc::new(roots))
    }
}

fn git(cwd: &std::path::Path, args: &[&str]) {
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

#[tokio::test]
async fn worktree_flow_covers_registry_checkpoints_and_diffs() {
    let fixture = Fixture::init();
    let core = fixture.core();
    let info = core
        .git_worktree_create(fixture.spec("t1"))
        .await
        .expect("create worktree");
    assert_eq!(info.branch, "tethys/t1", "branch template applied");
    assert_eq!(core.git_worktree_list().await.expect("list").len(), 1);

    core.on_thread_state("t1", 1, ThreadRuntimeState::Running)
        .await
        .expect("start checkpoint");
    std::fs::write(PathBuf::from(&info.path).join("pkg/a.txt"), "two\n").expect("edit");
    core.on_thread_state("t1", 1, ThreadRuntimeState::Idle)
        .await
        .expect("end checkpoint");

    let checkpoints = core
        .git_checkpoint_list("t1".to_string())
        .await
        .expect("checkpoints");
    assert_eq!(checkpoints.len(), 2);
    assert_eq!(checkpoints[0].phase, CheckpointPhase::Start);
    assert_eq!(checkpoints[1].phase, CheckpointPhase::End);

    let source = DiffSource::TurnStartEnd {
        thread_id: "t1".to_string(),
        turn: 1,
    };
    let summary = core
        .git_diff_summary(source.clone())
        .await
        .expect("summary");
    assert_eq!(summary.files.len(), 1);
    assert_eq!(summary.files[0].path, "pkg/a.txt");

    core.git_stage("t1".to_string(), vec!["pkg/a.txt".to_string()])
        .await
        .expect("stage");
    core.git_unstage("t1".to_string(), vec!["pkg/a.txt".to_string()])
        .await
        .expect("unstage");
    core.git_discard(
        "t1".to_string(),
        DiffSource::IndexWorktree {
            thread_id: "t1".to_string(),
        },
        None,
    )
    .await
    .expect("discard live changes");
    assert_eq!(
        std::fs::read_to_string(PathBuf::from(&info.path).join("pkg/a.txt"))
            .expect("read")
            .trim_end(),
        "one"
    );

    let restored = core
        .git_checkpoint_restore(
            RestoreTarget::Checkpoint {
                thread_id: "t1".to_string(),
                turn: 1,
                phase: CheckpointPhase::End,
            },
            Some(RestorePolicy::Force),
        )
        .await
        .expect("restore");
    assert_eq!(restored.undo.worktree_tree.len(), 40);

    std::fs::write(PathBuf::from(&info.path).join("pkg/a.txt"), "dirty\n").expect("dirty");
    let error = core
        .git_worktree_remove("t1".to_string(), false, false)
        .await
        .expect_err("delete is blocked");
    assert!(
        matches!(error, ApiError::DeleteBlocked { .. }),
        "got {error:?}"
    );

    core.git_worktree_remove("t1".to_string(), true, false)
        .await
        .expect("force delete");
    assert!(core.git_worktree_list().await.expect("list").is_empty());
}

#[tokio::test]
async fn in_progress_turn_falls_back_to_live_worktree_diff() {
    let fixture = Fixture::init();
    let core = fixture.core();
    let info = core
        .git_worktree_create(fixture.spec("t2"))
        .await
        .expect("create worktree");
    core.on_thread_state("t2", 1, ThreadRuntimeState::Running)
        .await
        .expect("start checkpoint");
    std::fs::write(PathBuf::from(&info.path).join("pkg/a.txt"), "two\n").expect("edit");

    let summary = core
        .git_diff_summary(DiffSource::TurnStartEnd {
            thread_id: "t2".to_string(),
            turn: 1,
        })
        .await
        .expect("fallback summary");
    assert!(
        matches!(summary.source, DiffSource::TurnStartWorktree { .. }),
        "in-progress diff uses the live worktree: {:?}",
        summary.source
    );
    assert_eq!(summary.files.len(), 1);
}

#[tokio::test]
async fn default_bootstrap_globs_copy_ignored_env_files() {
    let fixture = Fixture::init();
    std::fs::write(fixture.root.join(".env.local"), "SECRET=1\n").expect("env file");
    let core = fixture.core();
    let info = core
        .git_worktree_create(fixture.spec("t3"))
        .await
        .expect("create worktree");
    assert_eq!(
        std::fs::read_to_string(PathBuf::from(&info.path).join(".env.local")).expect("copied"),
        "SECRET=1\n"
    );
}

#[tokio::test]
async fn configured_worktrees_dir_is_honored() {
    let fixture = Fixture::init();
    let worktrees_dir = fixture.worktrees.path().join("configured");
    std::fs::create_dir_all(fixture.root.join(".tethys")).expect("config dir");
    std::fs::write(
        fixture.root.join(".tethys/config.json"),
        format!(
            "{{\"git\": {{\"worktrees_dir\": {:?}}}}}",
            worktrees_dir.to_string_lossy()
        ),
    )
    .expect("config");
    let mut spec = fixture.spec("t5");
    spec.path = String::new();

    let core = fixture.core();
    let info = core
        .git_worktree_create(spec)
        .await
        .expect("create with configured dir");
    let resolved = std::fs::canonicalize(&info.path).expect("canonical worktree path");
    let expected = std::fs::canonicalize(&worktrees_dir).expect("canonical worktrees dir");
    assert!(
        resolved.starts_with(&expected),
        "resolved path: {}",
        info.path
    );
    assert!(resolved.is_dir());
}

#[tokio::test]
async fn malformed_project_config_returns_typed_error() {
    let fixture = Fixture::init();
    std::fs::create_dir_all(fixture.root.join(".tethys")).expect("config dir");
    std::fs::write(fixture.root.join(".tethys/config.json"), "{ not json").expect("config");
    let core = fixture.core();
    let error = core
        .git_worktree_create(fixture.spec("t4"))
        .await
        .expect_err("malformed config");
    assert!(matches!(error, ApiError::InvalidConfig(_)), "got {error:?}");
}
