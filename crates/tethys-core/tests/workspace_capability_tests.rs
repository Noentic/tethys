//! Capability resolver: the four M1.6b fixture shapes from real folders.

use std::path::Path;

use tethys_api::WorkspaceApi;
use tethys_core::workspace::capability::{resolve, resolve_folder, CapabilityInputs};
use tethys_schema::catalog::{TrustGrant, TrustScope};
use tethys_schema::workspace::{GitHost, PermissionMode, Vcs, WorkspaceCapabilities};

fn init_git(dir: &Path) {
    std::fs::create_dir_all(dir).expect("create repo dir");
    let output = std::process::Command::new("git")
        .args(["init", "-q", "-b", "main"])
        .current_dir(dir)
        .output()
        .expect("git init");
    assert!(output.status.success(), "git init failed");
}

fn add_remote(dir: &Path, url: &str) {
    let output = std::process::Command::new("git")
        .args(["remote", "add", "origin", url])
        .current_dir(dir)
        .output()
        .expect("git remote add");
    assert!(output.status.success(), "git remote add failed");
}

fn git_remote(dir: &Path, url: &str) {
    init_git(dir);
    add_remote(dir, url);
}

#[test]
fn git_remote_github_shape() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let root = tmp.path().join("repo");
    git_remote(&root, "https://github.com/x/y.git");
    assert_eq!(
        resolve_folder(&root),
        WorkspaceCapabilities {
            vcs: Vcs::GitRemote {
                host: GitHost::Github
            },
            restore: true,
            max_concurrent_sessions: None,
        }
    );
}

#[test]
fn git_local_shape() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let root = tmp.path().join("repo");
    init_git(&root);
    assert_eq!(
        resolve_folder(&root),
        WorkspaceCapabilities {
            vcs: Vcs::GitLocal,
            restore: true,
            max_concurrent_sessions: None,
        }
    );
}

#[test]
fn no_git_shape() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let root = tmp.path().join("plain");
    std::fs::create_dir_all(&root).expect("plain root");
    assert_eq!(
        resolve_folder(&root),
        WorkspaceCapabilities {
            vcs: Vcs::None,
            restore: false,
            max_concurrent_sessions: Some(1),
        }
    );
}

#[test]
fn git_no_restore_shape_keeps_the_remote_badge() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let root = tmp.path().join("repo");
    git_remote(&root, "https://github.com/x/y.git");
    let caps = resolve(&root, CapabilityInputs { restore: false });
    assert_eq!(
        caps.vcs,
        Vcs::GitRemote {
            host: GitHost::Github
        }
    );
    assert!(!caps.restore);
    assert_eq!(caps.max_concurrent_sessions, None);
}

#[test]
fn remote_host_parsing() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let gitlab = tmp.path().join("gitlab");
    git_remote(&gitlab, "git@gitlab.com:x/y.git");
    assert_eq!(
        resolve_folder(&gitlab).vcs,
        Vcs::GitRemote {
            host: GitHost::Gitlab
        }
    );

    let self_hosted = tmp.path().join("other");
    git_remote(&self_hosted, "https://git.example.dev/x/y.git");
    assert_eq!(
        resolve_folder(&self_hosted).vcs,
        Vcs::GitRemote {
            host: GitHost::Other
        }
    );
}

#[tokio::test]
async fn cache_re_reads_after_invalidation() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let home = tmp.path().join("home");
    let root = tmp.path().join("folder");
    std::fs::create_dir_all(&root).expect("folder");
    let core = tethys_core::Core::open(&home).await.expect("Core::open");

    let item = core
        .workspace_add(TrustGrant {
            path: root.display().to_string(),
            permission_mode: PermissionMode::Supervised,
            scope: TrustScope::Folder,
            init_git: false,
        })
        .await
        .expect("add");
    assert_eq!(item.capabilities.max_concurrent_sessions, Some(1));
    assert!(!item.capabilities.restore);

    // A cache hit returns the stored set: the folder becomes a git repo but,
    // with no invalidation, the cached `restore=false` is returned — proving no
    // git read happened (a re-read would report `restore=true`).
    init_git(&root);
    let cached = core
        .workspace_capabilities(item.id.clone())
        .await
        .expect("capabilities");
    assert_eq!(cached, item.capabilities, "cache hit must not re-read git");
    assert!(!cached.restore, "stale cached value until invalidated");

    // After invalidation, the next call re-reads.
    core.invalidate_capabilities(item.id.as_str());
    let reread = core
        .workspace_capabilities(item.id)
        .await
        .expect("re-read capabilities");
    assert!(reread.restore);
    assert_eq!(reread.max_concurrent_sessions, None);
}

#[tokio::test]
async fn initialize_git_refreshes_capabilities_for_the_trusted_workspace() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let home = tmp.path().join("home");
    let root = tmp.path().join("folder");
    std::fs::create_dir_all(&root).expect("folder");
    let core = tethys_core::Core::open(&home).await.expect("Core::open");
    let workspace = core
        .workspace_add(TrustGrant {
            path: root.display().to_string(),
            permission_mode: PermissionMode::Supervised,
            scope: TrustScope::Folder,
            init_git: false,
        })
        .await
        .expect("add");

    let capabilities = core
        .workspace_initialize_git(workspace.id.clone())
        .await
        .expect("initialize git");

    assert_eq!(capabilities.vcs, Vcs::GitLocal);
    assert_eq!(capabilities.max_concurrent_sessions, None);
}
