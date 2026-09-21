use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use tempfile::tempdir;
use tethys_api::{ApiError, CommandsApi, GitApi, McpApi, SearchApi, SkillsApi, WorkspaceApi};
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

fn init_git_repo(dir: &Path) {
    fs::create_dir_all(dir).expect("create repo");
    for args in [
        vec!["init", "-b", "main"],
        vec!["config", "core.autocrlf", "false"],
        vec!["config", "user.email", "test@test.com"],
        vec!["config", "user.name", "Test"],
    ] {
        std::process::Command::new("git")
            .args(args)
            .current_dir(dir)
            .output()
            .expect("git command");
    }
    fs::write(dir.join("README.md"), b"# Test\n").expect("write file");
    std::process::Command::new("git")
        .args(["add", "."])
        .current_dir(dir)
        .output()
        .expect("git add");
    std::process::Command::new("git")
        .args(["commit", "-m", "init"])
        .current_dir(dir)
        .output()
        .expect("git commit");
}

/// Grants trust for `id` whose folder is `root`, with the canonical path and
/// no remote (a local or non-git folder).
async fn trust_workspace(core: &Core, id: &str, root: &Path) {
    let resolved = fs::canonicalize(root).expect("canonicalize root");
    core.sync_store()
        .expect("sync store")
        .upsert_trust(tethys_store::TrustRow {
            workspace_id: id.to_string(),
            resolved_path: resolved.to_string_lossy().to_string(),
            host: "local".to_string(),
            remote_url: None,
            permission_mode: "supervised".to_string(),
            scope: "folder".to_string(),
            trusted_at: 0,
        })
        .await
        .expect("upsert trust");
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

    assert_every_filesystem_namespace_is_not_found(&core, &unknown_id).await;

    // Assert filesystem remains identical
    let after = snapshot_dir(&test_dir);
    assert_eq!(before, after, "Directory modified despite NotFound errors!");
}

/// The one `WorkspaceRoots` trust rule covers every filesystem-touching
/// namespace (M1.4 routed them all through the port), so one helper proves it.
async fn assert_every_filesystem_namespace_is_not_found(core: &Core, id: &WorkspaceId) {
    // search.files
    let res = core.search_files(id.clone(), "query".into(), 10).await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "search_files: expected NotFound, got {res:?}"
    );

    // commands.list
    let res = core.commands_list(Some(id.clone()), false).await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "commands_list: expected NotFound, got {res:?}"
    );

    // commands.expand
    let res = core
        .commands_expand("cmd".into(), "args".into(), Some(id.clone()))
        .await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "commands_expand: expected NotFound, got {res:?}"
    );

    // mcp.registry.list
    let res = core.mcp_registry_list(Some(id.clone())).await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "mcp_registry_list: expected NotFound, got {res:?}"
    );

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
    let res = core
        .mcp_registry_set(
            "test".into(),
            dummy_entry,
            Scope::Workspace,
            Some(id.clone()),
        )
        .await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "mcp_registry_set: expected NotFound, got {res:?}"
    );

    // mcp.registry.delete
    let res = core
        .mcp_registry_delete("test".into(), Scope::Workspace, Some(id.clone()))
        .await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "mcp_registry_delete: expected NotFound, got {res:?}"
    );

    // mcp.effective
    let res = core.mcp_effective(None, Some(id.clone())).await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "mcp_effective: expected NotFound, got {res:?}"
    );

    // mcp.attachments
    let res = core.mcp_attachments(id.clone()).await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "mcp_attachments: expected NotFound, got {res:?}"
    );

    // mcp.projection.plan
    let res = core
        .mcp_projection_plan(id.clone(), TargetId::ClaudeCode, Scope::Workspace)
        .await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "mcp_projection_plan: expected NotFound, got {res:?}"
    );

    // mcp.projection.rollback
    let res = core
        .mcp_projection_rollback(id.clone(), TargetId::ClaudeCode, Scope::Workspace)
        .await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "mcp_projection_rollback: expected NotFound, got {res:?}"
    );

    // mcp.projection.verify
    let res = core
        .mcp_projection_verify(id.clone(), TargetId::ClaudeCode, Scope::Workspace)
        .await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "mcp_projection_verify: expected NotFound, got {res:?}"
    );

    // mcp.import.scan
    let res = core.mcp_import_scan(id.clone()).await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "mcp_import_scan: expected NotFound, got {res:?}"
    );

    // mcp.import.apply
    let res = core
        .mcp_import_apply(id.clone(), vec![], Scope::Workspace)
        .await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "mcp_import_apply: expected NotFound, got {res:?}"
    );

    // skills.list
    let res = core.skills_list(id.clone()).await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "skills_list: expected NotFound, got {res:?}"
    );

    // skills.import
    let res = core
        .skills_import(
            id.clone(),
            Scope::Workspace,
            SkillImportSource::Folder {
                path: "/tmp".into(),
            },
        )
        .await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "skills_import: expected NotFound, got {res:?}"
    );

    // skills.update_check
    let res = core
        .skills_update_check(id.clone(), Scope::Workspace, "name".into())
        .await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "skills_update_check: expected NotFound, got {res:?}"
    );

    // skills.update_plan
    let res = core
        .skills_update_plan(id.clone(), Scope::Workspace, "name".into())
        .await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "skills_update_plan: expected NotFound, got {res:?}"
    );

    // skills.update_apply
    let res = core
        .skills_update_apply(id.clone(), Scope::Workspace, "name".into())
        .await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "skills_update_apply: expected NotFound, got {res:?}"
    );

    // skills.trust
    let res = core
        .skills_trust(id.clone(), Scope::Workspace, "name".into())
        .await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "skills_trust: expected NotFound, got {res:?}"
    );

    // skills.enable
    let res = core
        .skills_enable(id.clone(), Scope::Workspace, "name".into(), true)
        .await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "skills_enable: expected NotFound, got {res:?}"
    );

    // git.worktree.create
    let spec = WorktreeSpec {
        thread_id: "thread-1".into(),
        workspace_id: id.clone(),
        slug: "slug-1".into(),
        path: "".into(),
        branch: "branch-1".into(),
        base: "main".into(),
        bootstrap_globs: vec![],
        setup_script: None,
        main_checkout: false,
    };
    let res = core.git_worktree_create(spec).await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "git_worktree_create: expected NotFound, got {res:?}"
    );
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
async fn untrusted_workspace_row_resolves_not_found_across_namespaces() {
    let tmp = tempdir().expect("tempdir");
    let home = tmp.path().join("home");
    let root = tmp.path().join("repo");
    fs::create_dir_all(&root).expect("root");
    fs::write(root.join("sentinel.txt"), b"do-not-touch").expect("sentinel");
    let before = snapshot_dir(&root);

    let core = Core::open(&home).await.expect("Core::open");
    core.sync_store()
        .expect("sync store")
        .ensure_workspace("ws-untrusted", &root.display().to_string(), "plain")
        .await
        .expect("ensure workspace");
    let id = WorkspaceId::new("ws-untrusted");

    // The row exists in `workspaces`, but with no trust row every
    // filesystem-touching namespace resolves through the one rule to NotFound.
    assert_every_filesystem_namespace_is_not_found(&core, &id).await;
    assert_eq!(snapshot_dir(&root), before, "no file touched on refusal");

    // Granting trust makes the same id resolve.
    trust_workspace(&core, "ws-untrusted", &root).await;
    assert!(
        core.skills_list(id.clone()).await.is_ok(),
        "trusted id resolves"
    );

    // Revoking removes it again.
    core.workspace_remove(id.clone()).await.expect("revoke");
    let res = core.skills_list(id).await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "revoked: {res:?}"
    );
    assert_eq!(snapshot_dir(&root), before, "no file touched after revoke");
}

#[tokio::test]
async fn changed_trust_key_reprompts_until_regranted() {
    let tmp = tempdir().expect("tempdir");
    let home = tmp.path().join("home");
    let root = tmp.path().join("repo");
    init_git_repo(&root);
    let core = Core::open(&home).await.expect("Core::open");
    core.sync_store()
        .expect("sync store")
        .ensure_workspace("ws-change", &root.display().to_string(), "worktree")
        .await
        .expect("ensure");
    trust_workspace(&core, "ws-change", &root).await;
    let id = WorkspaceId::new("ws-change");
    assert!(core.skills_list(id.clone()).await.is_ok());

    // A new remote changes the trust key: re-prompt (NotFound) until re-granted.
    std::process::Command::new("git")
        .args(["remote", "add", "origin", "https://github.com/x/y.git"])
        .current_dir(&root)
        .output()
        .expect("git remote add");
    let res = core.skills_list(id.clone()).await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "changed remote: {res:?}"
    );

    // Re-granting with the new remote restores access.
    let resolved = fs::canonicalize(&root).expect("canonicalize");
    core.sync_store()
        .expect("sync store")
        .upsert_trust(tethys_store::TrustRow {
            workspace_id: "ws-change".to_string(),
            resolved_path: resolved.to_string_lossy().to_string(),
            host: "local".to_string(),
            remote_url: Some("https://github.com/x/y.git".to_string()),
            permission_mode: "supervised".to_string(),
            scope: "folder".to_string(),
            trusted_at: 0,
        })
        .await
        .expect("regrant");
    assert!(core.skills_list(id).await.is_ok(), "re-granted resolves");
}

#[cfg(unix)]
#[tokio::test]
async fn symlink_swap_reprompts_until_regranted() {
    use std::os::unix::fs::symlink;

    let tmp = tempdir().expect("tempdir");
    let home = tmp.path().join("home");
    let real_a = tmp.path().join("real-a");
    let real_b = tmp.path().join("real-b");
    let link = tmp.path().join("link");
    fs::create_dir_all(&real_a).expect("real a");
    fs::create_dir_all(&real_b).expect("real b");
    symlink(&real_a, &link).expect("symlink a");

    let core = Core::open(&home).await.expect("Core::open");
    core.sync_store()
        .expect("sync store")
        .ensure_workspace("ws-link", &link.display().to_string(), "plain")
        .await
        .expect("ensure");
    trust_workspace(&core, "ws-link", &real_a).await;
    let id = WorkspaceId::new("ws-link");
    assert!(core.skills_list(id.clone()).await.is_ok());

    // Repointing the symlink changes the canonical root: re-prompt (NotFound)
    // until re-trusted.
    fs::remove_file(&link).expect("remove link");
    symlink(&real_b, &link).expect("symlink b");
    let res = core.skills_list(id).await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "symlink swap: {res:?}"
    );
}

#[tokio::test]
async fn core_open_on_temp_home_creates_store_and_allows_skills_and_mcp() {
    let tmp = tempdir().expect("temp home");
    let home = tmp.path().to_path_buf();
    let core = Core::open(&home).await.expect("Core::open");

    let db_path = home.join(".tethys/state.db");
    assert!(
        db_path.is_file(),
        "state.db was not created at expected path: {}",
        db_path.display()
    );

    // Register a workspace in the store
    let ws_dir = tmp.path().join("workspace_one");
    fs::create_dir_all(&ws_dir).expect("create ws_dir");
    core.sync_store()
        .expect("sync store present")
        .ensure_workspace("ws-1", &ws_dir.display().to_string(), "plain")
        .await
        .expect("ensure_workspace");
    trust_workspace(&core, "ws-1", &ws_dir).await;

    // skills.list succeeds against the opened store
    let skills = core
        .skills_list(WorkspaceId::new("ws-1"))
        .await
        .expect("skills_list must succeed");
    assert!(skills.is_empty());

    // mcp.projection.plan succeeds against the opened store
    let plan = core
        .mcp_projection_plan(
            WorkspaceId::new("ws-1"),
            TargetId::OpenCode,
            Scope::Workspace,
        )
        .await
        .expect("projection plan must succeed");
    let applied = core
        .mcp_projection_apply(
            WorkspaceId::new("ws-1"),
            TargetId::OpenCode,
            Scope::Workspace,
            plan,
        )
        .await
        .expect("projection apply must succeed");
    assert_eq!(applied.entries.len(), 0);
}

#[tokio::test]
async fn worktree_creation_for_workspace_id_lands_under_expected_location() {
    let tmp = tempdir().expect("tempdir");
    let home = tmp.path().join("home");
    let core = Core::open(&home).await.expect("Core::open");

    let repo_dir = tmp.path().join("repo");
    init_git_repo(&repo_dir);

    // Register workspace
    core.sync_store()
        .unwrap()
        .ensure_workspace("ws-git", &repo_dir.display().to_string(), "worktree")
        .await
        .expect("ensure ws");
    trust_workspace(&core, "ws-git", &repo_dir).await;

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

    let info = core
        .git_worktree_create(spec)
        .await
        .expect("create worktree");
    assert!(Path::new(&info.path).exists());
    assert!(info.path.contains("worktrees"));
    assert!(info.path.contains("feat-test"));
}

async fn projection_workspace(home: &Path, root: &Path, id: &str) -> Core {
    fs::create_dir_all(root).expect("create workspace root");
    let core = Core::open(home).await.expect("Core::open");
    core.sync_store()
        .expect("sync store")
        .ensure_workspace(id, &root.display().to_string(), "plain")
        .await
        .expect("ensure workspace");
    trust_workspace(&core, id, root).await;
    core
}

#[tokio::test]
async fn projection_apply_rejects_tampered_path_and_writes_nothing() {
    let tmp = tempdir().expect("tempdir");
    let home = tmp.path().join("home");
    let root = tmp.path().join("repo");
    let core = projection_workspace(&home, &root, "ws-sec").await;
    let ws = WorkspaceId::new("ws-sec");

    let outside = tmp.path().join("outside.json");
    fs::write(&outside, b"secret").expect("write outside");

    let mut plan = core
        .mcp_projection_plan(ws.clone(), TargetId::OpenCode, Scope::Workspace)
        .await
        .expect("plan");
    plan.path = outside.display().to_string();
    plan.content = "overwritten".into();

    let res = core
        .mcp_projection_apply(ws.clone(), TargetId::OpenCode, Scope::Workspace, plan)
        .await;
    assert!(
        matches!(res, Err(ApiError::Conflict(_))),
        "expected Conflict, got {res:?}"
    );
    assert_eq!(fs::read(&outside).expect("outside intact"), b"secret");
    assert!(
        !root.join("opencode.json").exists(),
        "target must not be written"
    );
}

#[tokio::test]
async fn projection_apply_rejects_tampered_content() {
    let tmp = tempdir().expect("tempdir");
    let home = tmp.path().join("home");
    let root = tmp.path().join("repo");
    let core = projection_workspace(&home, &root, "ws-sec").await;
    let ws = WorkspaceId::new("ws-sec");

    let mut plan = core
        .mcp_projection_plan(ws.clone(), TargetId::OpenCode, Scope::Workspace)
        .await
        .expect("plan");
    plan.content = format!("{}\n// injected\n", plan.content);

    let res = core
        .mcp_projection_apply(ws, TargetId::OpenCode, Scope::Workspace, plan)
        .await;
    assert!(
        matches!(res, Err(ApiError::Conflict(_))),
        "expected Conflict, got {res:?}"
    );
    assert!(
        !root.join("opencode.json").exists(),
        "target must not be written"
    );
}

#[tokio::test]
async fn projection_apply_for_unknown_workspace_is_refused() {
    let tmp = tempdir().expect("tempdir");
    let home = tmp.path().join("home");
    let root = tmp.path().join("repo");
    let core = projection_workspace(&home, &root, "ws-sec").await;

    let plan = core
        .mcp_projection_plan(
            WorkspaceId::new("ws-sec"),
            TargetId::OpenCode,
            Scope::Workspace,
        )
        .await
        .expect("plan");

    let res = core
        .mcp_projection_apply(
            WorkspaceId::new("unknown-ws"),
            TargetId::OpenCode,
            Scope::Workspace,
            plan,
        )
        .await;
    assert!(
        matches!(res, Err(ApiError::NotFound(_))),
        "expected NotFound, got {res:?}"
    );
    assert!(!root.join("opencode.json").exists());
}

#[tokio::test]
async fn worktree_creation_rejects_out_of_jail_path() {
    let tmp = tempdir().expect("tempdir");
    let home = tmp.path().join("home");
    let core = Core::open(&home).await.expect("Core::open");

    let repo_dir = tmp.path().join("repo");
    init_git_repo(&repo_dir);
    core.sync_store()
        .unwrap()
        .ensure_workspace("ws-jail", &repo_dir.display().to_string(), "worktree")
        .await
        .expect("ensure ws");
    trust_workspace(&core, "ws-jail", &repo_dir).await;

    let escape = tmp.path().join("evil-wt");
    let spec = WorktreeSpec {
        thread_id: "thread-jail".into(),
        workspace_id: WorkspaceId::new("ws-jail"),
        slug: "feat-jail".into(),
        path: escape.display().to_string(),
        branch: "feat/jail".into(),
        base: "main".into(),
        bootstrap_globs: vec![],
        setup_script: None,
        main_checkout: false,
    };

    let res = core.git_worktree_create(spec).await;
    assert!(
        matches!(res, Err(ApiError::InvalidConfig(_))),
        "expected InvalidConfig, got {res:?}"
    );
    assert!(!escape.exists(), "out-of-jail worktree must not be created");
}
