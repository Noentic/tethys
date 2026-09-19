use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use tempfile::tempdir;
use tethys_api::{ApiError, McpApi, SkillsApi, TethysApi};
use tethys_core::Core;
use tethys_schema::sync::{
    RegistryEntry, Scope, SkillImportSource, TargetId, TransportKind, WorkspaceId,
};
use tethys_schema::WorktreeSpec;

fn snapshot_dir(dir: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut files = BTreeMap::new();
    if !dir.exists() {
        return files;
    }
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        if let Ok(entries) = fs::read_dir(&current) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                } else if path.is_file() {
                    if let Ok(bytes) = fs::read(&path) {
                        let rel = path.strip_prefix(dir).unwrap().to_path_buf();
                        files.insert(rel, bytes);
                    }
                }
            }
        }
    }
    files
}

#[tokio::test]
async fn unknown_workspace_id_returns_not_found_and_touches_nothing() {
    let tmp = tempdir().expect("tempdir");
    let test_dir = tmp.path().join("test_fs");
    fs::create_dir_all(&test_dir).expect("create test_fs");
    fs::write(test_dir.join("sentinel.txt"), b"do-not-touch").expect("write sentinel");
    let before = snapshot_dir(&test_dir);

    let core = Core::new("0.0.0");
    let unknown_id = WorkspaceId::new("unknown-ws-12345");

    // search.files
    let res = core.search_files(unknown_id.clone(), "query".into(), 10).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "search_files: expected NotFound, got {res:?}");

    // commands.list
    let res = core.commands_list(Some(unknown_id.clone())).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "commands_list: expected NotFound, got {res:?}");

    // commands.expand
    let res = core.commands_expand("cmd".into(), "args".into(), Some(unknown_id.clone())).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "commands_expand: expected NotFound, got {res:?}");

    // mcp.registry.list
    let res = core.mcp_registry_list(Some(unknown_id.clone())).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "mcp_registry_list: expected NotFound, got {res:?}");

    // mcp.registry.set
    let dummy_entry = RegistryEntry {
        transport: TransportKind::Stdio,
        command: Some("cmd".into()),
        args: Vec::new(),
        env: Default::default(),
        url: None,
        headers: Default::default(),
        meta: Default::default(),
    };
    let res = core.mcp_registry_set("test".into(), dummy_entry, Scope::Workspace, Some(unknown_id.clone())).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "mcp_registry_set: expected NotFound, got {res:?}");

    // mcp.registry.delete
    let res = core.mcp_registry_delete("test".into(), Scope::Workspace, Some(unknown_id.clone())).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "mcp_registry_delete: expected NotFound, got {res:?}");

    // mcp.effective
    let res = core.mcp_effective(None, Some(unknown_id.clone())).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "mcp_effective: expected NotFound, got {res:?}");

    // mcp.attachments
    let res = core.mcp_attachments(unknown_id.clone()).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "mcp_attachments: expected NotFound, got {res:?}");

    // mcp.projection.plan
    let res = core.mcp_projection_plan(unknown_id.clone(), TargetId::ClaudeCode, Scope::Workspace).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "mcp_projection_plan: expected NotFound, got {res:?}");

    // mcp.projection.rollback
    let res = core.mcp_projection_rollback(unknown_id.clone(), TargetId::ClaudeCode, Scope::Workspace).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "mcp_projection_rollback: expected NotFound, got {res:?}");

    // mcp.projection.verify
    let res = core.mcp_projection_verify(unknown_id.clone(), TargetId::ClaudeCode, Scope::Workspace).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "mcp_projection_verify: expected NotFound, got {res:?}");

    // mcp.import.scan
    let res = core.mcp_import_scan(unknown_id.clone()).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "mcp_import_scan: expected NotFound, got {res:?}");

    // mcp.import.apply
    let res = core.mcp_import_apply(unknown_id.clone(), vec![], Scope::Workspace).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "mcp_import_apply: expected NotFound, got {res:?}");

    // skills.list
    let res = core.skills_list(unknown_id.clone()).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "skills_list: expected NotFound, got {res:?}");

    // skills.import
    let res = core.skills_import(unknown_id.clone(), Scope::Workspace, SkillImportSource::Folder { path: "/tmp".into() }).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "skills_import: expected NotFound, got {res:?}");

    // skills.update_check
    let res = core.skills_update_check(unknown_id.clone(), Scope::Workspace, "name".into()).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "skills_update_check: expected NotFound, got {res:?}");

    // skills.update_plan
    let res = core.skills_update_plan(unknown_id.clone(), Scope::Workspace, "name".into()).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "skills_update_plan: expected NotFound, got {res:?}");

    // skills.update_apply
    let res = core.skills_update_apply(unknown_id.clone(), Scope::Workspace, "name".into()).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "skills_update_apply: expected NotFound, got {res:?}");

    // skills.trust
    let res = core.skills_trust(unknown_id.clone(), Scope::Workspace, "name".into()).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "skills_trust: expected NotFound, got {res:?}");

    // skills.enable
    let res = core.skills_enable(unknown_id.clone(), Scope::Workspace, "name".into(), true).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "skills_enable: expected NotFound, got {res:?}");

    // git.worktree.create
    let spec = WorktreeSpec {
        thread_id: "thread-1".into(),
        workspace_id: unknown_id.clone(),
        slug: "slug-1".into(),
        path: "".into(),
        branch: "branch-1".into(),
        base: "main".into(),
        bootstrap_globs: vec![],
        setup_script: None,
        main_checkout: false,
    };
    let res = core.git_worktree_create(spec).await;
    assert!(matches!(res, Err(ApiError::NotFound(_))), "git_worktree_create: expected NotFound, got {res:?}");

    // Assert filesystem remains identical
    let after = snapshot_dir(&test_dir);
    assert_eq!(before, after, "Directory modified despite NotFound errors!");
}

#[tokio::test]
async fn path_shaped_workspace_id_is_treated_as_unknown_id() {
    let core = Core::new("0.0.0");
    for path_id in ["/etc", "../x", "C:\\Windows", "/dev/null"] {
        let id = WorkspaceId::new(path_id);
        let res = core.skills_list(id.clone()).await;
        assert!(
            matches!(res, Err(ApiError::NotFound(_))),
            "path-shaped id {path_id} must return NotFound, got {res:?}"
        );
        let res = core.search_files(id.clone(), "test".into(), 10).await;
        assert!(
            matches!(res, Err(ApiError::NotFound(_))),
            "path-shaped id {path_id} must return NotFound, got {res:?}"
        );
    }
}

#[tokio::test]
async fn core_open_on_temp_home_creates_store_and_allows_skills_and_mcp() {
    let tmp = tempdir().expect("temp home");
    let home = tmp.path().to_path_buf();
    let core = Core::open(&home).await.expect("Core::open");

    let db_path = home.join(".tethys/state.db");
    assert!(db_path.is_file(), "state.db was not created at expected path: {}", db_path.display());

    // Register a workspace in the store
    let ws_dir = tmp.path().join("workspace_one");
    fs::create_dir_all(&ws_dir).expect("create ws_dir");
    core.sync_store()
        .expect("sync store present")
        .ensure_workspace("ws-1", &ws_dir.display().to_string(), "plain")
        .await
        .expect("ensure_workspace");

    // skills.list succeeds against the opened store
    let skills = core.skills_list(WorkspaceId::new("ws-1")).await.expect("skills_list must succeed");
    assert!(skills.is_empty());

    // mcp.projection.plan succeeds against the opened store
    let plan = core
        .mcp_projection_plan(WorkspaceId::new("ws-1"), TargetId::OpenCode, Scope::Workspace)
        .await
        .expect("projection plan must succeed");
    let applied = core.mcp_projection_apply(plan).await.expect("projection apply must succeed");
    assert_eq!(applied.entries.len(), 0);
}

#[tokio::test]
async fn worktree_creation_for_workspace_id_lands_under_expected_location() {
    let tmp = tempdir().expect("tempdir");
    let home = tmp.path().join("home");
    let core = Core::open(&home).await.expect("Core::open");

    let repo_dir = tmp.path().join("repo");
    fs::create_dir_all(&repo_dir).expect("create repo");
    std::process::Command::new("git")
        .args(["init", "-b", "main"])
        .current_dir(&repo_dir)
        .output()
        .expect("git init");
    std::process::Command::new("git")
        .args(["config", "user.email", "test@test.com"])
        .current_dir(&repo_dir)
        .output()
        .expect("git config email");
    std::process::Command::new("git")
        .args(["config", "user.name", "Test"])
        .current_dir(&repo_dir)
        .output()
        .expect("git config name");
    fs::write(repo_dir.join("README.md"), b"# Test\n").expect("write file");
    std::process::Command::new("git")
        .args(["add", "."])
        .current_dir(&repo_dir)
        .output()
        .expect("git add");
    std::process::Command::new("git")
        .args(["commit", "-m", "init"])
        .current_dir(&repo_dir)
        .output()
        .expect("git commit");

    // Register workspace
    core.sync_store()
        .unwrap()
        .ensure_workspace("ws-git", &repo_dir.display().to_string(), "worktree")
        .await
        .expect("ensure ws");

    let spec = WorktreeSpec {
        thread_id: "thread-wt-1".into(),
        workspace_id: WorkspaceId::new("ws-git"),
        slug: "feat-test".into(),
        path: "".into(),
        branch: "feat/test".into(),
        base: "main".into(),
        bootstrap_globs: vec![],
        setup_script: None,
        main_checkout: false,
    };

    let info = core.git_worktree_create(spec).await.expect("create worktree");
    assert!(Path::new(&info.path).exists());
    assert!(info.path.contains("worktrees"));
    assert!(info.path.contains("feat-test"));
}
