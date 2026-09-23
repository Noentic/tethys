use std::path::Path;
use std::process::Command;
use std::sync::Arc;

use tethys_agent_servers::LaunchSpec;
use tethys_api::{ApiError, GitApi, ThreadApi};
use tethys_core::{workspace_roots::StaticWorkspaces, Core};
use tethys_schema::connection::AgentCompat;
use tethys_schema::thread::{CreateThread, ThreadIsolation};
use tethys_schema::{sync::WorkspaceId, WorktreeSpec};

fn git(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .current_dir(root)
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
async fn prepared_worktrees_are_cleaned_on_failure_and_thread_delete() {
    let temp = tempfile::tempdir().expect("temp dir");
    let root = temp.path().join("repo");
    let worktrees = temp.path().join("worktrees");
    std::fs::create_dir_all(&root).expect("repo dir");
    std::fs::create_dir_all(&worktrees).expect("worktrees dir");
    git(&root, &["init", "-q", "-b", "main"]);
    git(&root, &["config", "user.name", "Tethys Test"]);
    git(&root, &["config", "user.email", "test@tethys.dev"]);
    std::fs::write(root.join("tracked.txt"), "base\n").expect("tracked file");
    git(&root, &["add", "-A"]);
    git(&root, &["commit", "-q", "-m", "base"]);
    std::fs::create_dir_all(root.join(".tethys")).expect("config dir");
    std::fs::write(
        root.join(".tethys/config.json"),
        format!(
            r#"{{"git":{{"worktrees_dir":{:?}}}}}"#,
            worktrees.display().to_string()
        ),
    )
    .expect("git config");

    let roots = Arc::new(StaticWorkspaces::new().with("workspace", &root));
    let core = Core::new("test").with_workspace_roots(roots);
    let failed = core
        .thread_prepare(CreateThread {
            workspace_id: "workspace".into(),
            agent_profile_id: "missing-provider".into(),
            workdir: root.display().to_string(),
            additional_directories: Vec::new(),
            isolation: Some(ThreadIsolation::Worktree {
                base: "main".into(),
                branch: None,
            }),
        })
        .await
        .expect_err("missing profile fails preparation");
    assert!(matches!(failed, ApiError::NotFound(_)));
    assert!(core
        .git_worktree_list()
        .await
        .expect("list worktrees")
        .is_empty());
    assert_eq!(
        std::fs::read_dir(&worktrees)
            .expect("read worktrees")
            .count(),
        0
    );

    let profile = "test-provider";
    core.sessions().register_profile(
        LaunchSpec::new(profile, "/bin/false"),
        AgentCompat::default(),
    );
    let thread = core
        .thread_create(CreateThread {
            workspace_id: "workspace".into(),
            agent_profile_id: profile.into(),
            workdir: root.display().to_string(),
            additional_directories: Vec::new(),
            isolation: None,
        })
        .await
        .expect("create thread");
    core.git_worktree_create(WorktreeSpec {
        thread_id: thread.id.to_string(),
        workspace_id: WorkspaceId::new("workspace"),
        slug: thread.id.to_string(),
        path: String::new(),
        branch: String::new(),
        base: "main".into(),
        bootstrap_globs: Vec::new(),
        setup_script: None,
        main_checkout: false,
    })
    .await
    .expect("register clean worktree");

    core.thread_delete(thread.id).await.expect("delete thread");
    assert!(core
        .git_worktree_list()
        .await
        .expect("list worktrees")
        .is_empty());
    assert_eq!(
        std::fs::read_dir(&worktrees)
            .expect("read worktrees")
            .count(),
        0
    );
}
