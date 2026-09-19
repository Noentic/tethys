mod common;

use common::{FailingSetupRunner, NoopSetupRunner, TestRepo};
use tethys_git::GitError;
use tethys_schema::WorktreeSpec;

fn spec(repo: &TestRepo, path: &str, slug: &str, branch: &str) -> WorktreeSpec {
    WorktreeSpec {
        thread_id: format!("thread-{slug}"),
        workspace_id: repo.root.to_string_lossy().into_owned().into(),
        slug: slug.to_string(),
        path: path.to_string(),
        branch: branch.to_string(),
        base: "main".to_string(),
        bootstrap_globs: vec![".env*".to_string()],
        setup_script: None,
        main_checkout: false,
    }
}

#[test]
fn create_makes_branch_bootstraps_globs_and_runs_setup() {
    let repo = TestRepo::init();
    repo.write("pkg/app.txt", "base\n");
    repo.write(".gitignore", ".env*\nsecret.key\n");
    repo.commit("base");
    repo.write(".env.local", "SECRET=1\n");
    repo.write("secret.key", "not configured\n");

    let holder = tempfile::tempdir().expect("worktree temp dir");
    let path = holder.path().join("t1");
    let runner = NoopSetupRunner::new();
    let mut spec = spec(&repo, path.to_str().expect("utf8"), "t1", "tethys/t1");
    spec.setup_script = Some("npm install".to_string());

    let info = repo
        .engine()
        .worktree_create(&spec, &runner)
        .expect("create worktree");

    assert_eq!(info.branch, "tethys/t1");
    assert!(!info.main_checkout);
    assert!(!info.head.is_empty());
    assert!(path.join("pkg/app.txt").is_file());
    assert_eq!(
        std::fs::read_to_string(path.join(".env.local")).expect("read env"),
        "SECRET=1\n"
    );
    assert!(
        !path.join("secret.key").exists(),
        "unconfigured files stay out"
    );
    assert_eq!(
        *runner.last_script.lock().expect("lock"),
        Some("npm install".to_string())
    );
    assert_eq!(info.setup.expect("setup outcome").exit_code, Some(0));
}

#[test]
fn create_warns_for_lfs_and_submodules() {
    let repo = TestRepo::init();
    repo.write("pkg/app.txt", "base\n");
    repo.write(
        ".gitattributes",
        "*.bin filter=lfs diff=lfs merge=lfs -text\n",
    );
    repo.write(
        ".gitmodules",
        "[submodule \"x\"]\n\tpath = x\n\turl = ./x\n",
    );
    repo.commit("base");

    let holder = tempfile::tempdir().expect("worktree temp dir");
    let path = holder.path().join("t1");
    let mut spec = spec(&repo, path.to_str().expect("utf8"), "t1", "tethys/t1");
    spec.bootstrap_globs.clear();

    let info = repo
        .engine()
        .worktree_create(&spec, &NoopSetupRunner::new())
        .expect("create worktree");
    assert_eq!(info.warnings.len(), 2, "got {:?}", info.warnings);
}

#[test]
fn main_checkout_registers_without_creating_a_worktree() {
    let repo = TestRepo::init();
    repo.write("pkg/app.txt", "base\n");
    repo.commit("base");

    let mut spec = spec(&repo, "", "main-thread", "");
    spec.main_checkout = true;
    let info = repo
        .engine()
        .worktree_create(&spec, &NoopSetupRunner::new())
        .expect("register main checkout");

    assert!(info.main_checkout);
    assert_eq!(
        std::fs::canonicalize(&info.path).expect("canonical registered path"),
        std::fs::canonicalize(&repo.root).expect("canonical root"),
        "the main checkout registers under the real workspace root (macOS /var -> /private/var)"
    );
    assert_eq!(info.branch, "main");
}

#[test]
fn invalid_branch_is_rejected() {
    let repo = TestRepo::init();
    repo.write("pkg/app.txt", "base\n");
    repo.commit("base");

    let holder = tempfile::tempdir().expect("worktree temp dir");
    let path = holder.path().join("t1");
    let spec = spec(&repo, path.to_str().expect("utf8"), "t1", "bad..branch");
    let error = repo
        .engine()
        .worktree_create(&spec, &NoopSetupRunner::new())
        .expect_err("invalid branch");
    assert!(
        matches!(error, GitError::InvalidArgument(_)),
        "got {error:?}"
    );
    assert!(!path.exists());
}

#[test]
fn setup_failure_rolls_back_the_worktree() {
    let repo = TestRepo::init();
    repo.write("pkg/app.txt", "base\n");
    repo.commit("base");

    let holder = tempfile::tempdir().expect("worktree temp dir");
    let path = holder.path().join("t1");
    let mut spec = spec(&repo, path.to_str().expect("utf8"), "t1", "tethys/t1");
    spec.setup_script = Some("exit 1".to_string());

    let error = repo
        .engine()
        .worktree_create(&spec, &FailingSetupRunner)
        .expect_err("setup failure propagates");
    assert!(matches!(error, GitError::CommandFailed { .. }));
    assert!(!path.exists(), "failed creation is rolled back");
}
