//! Workspace catalog and trust flow through the typed API.

use std::fs;

use tethys_api::WorkspaceApi;
use tethys_core::Core;
use tethys_schema::catalog::{TrustGrant, TrustScope, WorkspaceTrustState};
use tethys_schema::workspace::PermissionMode;

#[tokio::test]
async fn add_grants_lists_and_revoke_removes() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let home = tmp.path().join("home");
    let root = tmp.path().join("folder");
    fs::create_dir_all(&root).expect("folder");

    let core = Core::open(&home).await.expect("Core::open");
    // An unrelated workspace row with no trust decision never appears.
    core.sync_store()
        .expect("sync store")
        .ensure_workspace("other", "/does/not/exist", "plain")
        .await
        .expect("ensure other");

    let item = core
        .workspace_add(TrustGrant {
            path: root.display().to_string(),
            permission_mode: PermissionMode::Supervised,
            scope: TrustScope::Folder,
            init_git: false,
        })
        .await
        .expect("add");
    assert_eq!(item.trust, WorkspaceTrustState::Trusted);
    assert_eq!(item.name, "folder");

    let list = core.workspace_list().await.expect("list");
    assert_eq!(list.len(), 1, "only the trusted workspace appears");
    assert_eq!(list[0].id, item.id);
    assert_eq!(list[0].path, item.path);

    assert_eq!(
        core.workspace_status(item.id.clone())
            .await
            .expect("status"),
        WorkspaceTrustState::Trusted
    );

    core.workspace_remove(item.id.clone())
        .await
        .expect("remove");
    assert!(core.workspace_list().await.expect("list").is_empty());
    assert_eq!(
        core.workspace_status(item.id).await.expect("status"),
        WorkspaceTrustState::Untrusted
    );
}

#[tokio::test]
async fn re_adding_the_same_folder_updates_one_card() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let home = tmp.path().join("home");
    let root = tmp.path().join("folder");
    fs::create_dir_all(&root).expect("folder");
    let core = Core::open(&home).await.expect("Core::open");

    let grant = |mode| TrustGrant {
        path: root.display().to_string(),
        permission_mode: mode,
        scope: TrustScope::Folder,
        init_git: false,
    };

    let first = core
        .workspace_add(grant(PermissionMode::Supervised))
        .await
        .expect("add");
    let second = core
        .workspace_add(grant(PermissionMode::Yolo))
        .await
        .expect("re-add");
    assert_eq!(first.id, second.id);
    assert_eq!(core.workspace_list().await.expect("list").len(), 1);
}
