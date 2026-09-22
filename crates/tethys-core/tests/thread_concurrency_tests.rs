//! `max_concurrent_sessions` enforcement in the one `thread.create` call site.

use std::path::Path;
use std::sync::Arc;

use tethys_agent_servers::{ConnectionStore, LaunchSpec, StoreOptions};
use tethys_api::ApiError;
use tethys_core::permission::DenyPermissionResolver;
use tethys_core::thread_session::{SyncSource, ThreadSessions};
use tethys_core::workspace_roots::{StaticWorkspaces, TrustFilteredRoots};
use tethys_core::workspace_trust::{StaticTrust, WorkspaceTrust};
use tethys_schema::connection::{AcpProtocol, AgentCompat};
use tethys_schema::thread::CreateThread;
use tethys_store::TrustRow;
use tethys_sync::MemorySecrets;

fn init_git(dir: &Path) {
    std::fs::create_dir_all(dir).expect("create repo dir");
    let output = std::process::Command::new("git")
        .args(["init", "-q", "-b", "main"])
        .current_dir(dir)
        .output()
        .expect("git init");
    assert!(output.status.success(), "git init failed");
}

fn build_sessions(home: &Path, root: &Path) -> (Arc<ThreadSessions>, String) {
    let roots = Arc::new(StaticWorkspaces::new().with("ws", root));
    let store = ConnectionStore::new(StoreOptions::new(
        AcpProtocol::V1,
        Arc::new(DenyPermissionResolver),
    ));
    let sessions = Arc::new(ThreadSessions::new(
        store,
        SyncSource::new(home, Arc::new(MemorySecrets::new())),
        roots,
    ));
    let profile = sessions.register_profile(
        LaunchSpec::new("agent", "/bin/echo"),
        AgentCompat {
            preferred_protocol: Some(AcpProtocol::V1),
            ..Default::default()
        },
    );
    (sessions, profile)
}

fn request(profile: &str, root: &Path) -> CreateThread {
    CreateThread {
        workspace_id: "ws".into(),
        agent_profile_id: profile.to_string(),
        workdir: root.display().to_string(),
        additional_directories: Vec::new(),
    }
}

#[tokio::test]
async fn non_git_workspace_refuses_a_second_session() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path().join("plain");
    std::fs::create_dir_all(&root).expect("plain root");
    let (sessions, profile) = build_sessions(dir.path(), &root);

    sessions
        .create(request(&profile, &root))
        .await
        .expect("first session");

    let err = sessions
        .create(request(&profile, &root))
        .await
        .expect_err("second session must be refused");
    match err {
        ApiError::ConcurrencyLimit { limit, .. } => assert_eq!(limit, 1),
        other => panic!("expected ConcurrencyLimit, got {other:?}"),
    }
    assert_eq!(sessions.list().len(), 1, "refused session is not inserted");
}

#[tokio::test]
async fn git_workspace_allows_many_sessions() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path().join("repo");
    init_git(&root);
    let (sessions, profile) = build_sessions(dir.path(), &root);

    sessions
        .create(request(&profile, &root))
        .await
        .expect("first");
    sessions
        .create(request(&profile, &root))
        .await
        .expect("second");
    sessions
        .create(request(&profile, &root))
        .await
        .expect("third");
    assert_eq!(sessions.list().len(), 3);
}

#[tokio::test]
async fn archiving_the_first_session_frees_the_cap() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path().join("plain");
    std::fs::create_dir_all(&root).expect("plain root");
    let (sessions, profile) = build_sessions(dir.path(), &root);

    let first = sessions
        .create(request(&profile, &root))
        .await
        .expect("first session");
    sessions.archive(&first.id).await.expect("archive");

    sessions
        .create(request(&profile, &root))
        .await
        .expect("a second session after the first is archived");
}

#[tokio::test]
async fn deleting_the_first_session_frees_the_cap() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path().join("plain");
    std::fs::create_dir_all(&root).expect("plain root");
    let (sessions, profile) = build_sessions(dir.path(), &root);

    let first = sessions
        .create(request(&profile, &root))
        .await
        .expect("first session");
    sessions.delete(&first.id).await.expect("delete");

    sessions
        .create(request(&profile, &root))
        .await
        .expect("a second session after the first is deleted");
}

/// The spawn gate (U3): an untrusted workspace refuses `thread.create` before
/// any lease is acquired or session created, then resolves once trusted.
#[tokio::test]
async fn untrusted_workspace_refuses_create_without_leasing() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path().join("plain");
    std::fs::create_dir_all(&root).expect("plain root");
    let inner = Arc::new(StaticWorkspaces::new().with("ws", &root));
    let trust = Arc::new(StaticTrust::new());
    let roots = Arc::new(TrustFilteredRoots::new(inner, trust.clone()));
    let store = ConnectionStore::new(StoreOptions::new(
        AcpProtocol::V1,
        Arc::new(DenyPermissionResolver),
    ));
    let sessions = ThreadSessions::new(
        store.clone(),
        SyncSource::new(dir.path(), Arc::new(MemorySecrets::new())),
        roots,
    );
    let profile = sessions.register_profile(
        LaunchSpec::new("agent", "/bin/echo"),
        AgentCompat {
            preferred_protocol: Some(AcpProtocol::V1),
            ..Default::default()
        },
    );

    let err = sessions
        .create(request(&profile, &root))
        .await
        .expect_err("untrusted workspace must be refused");
    assert!(
        matches!(err, ApiError::NotFound(_)),
        "expected NotFound, got {err:?}"
    );
    assert!(sessions.list().is_empty(), "no session created");
    assert!(store.entries().is_empty(), "no lease acquired");

    // Granting trust opens the same gate.
    let resolved = std::fs::canonicalize(&root).expect("canonicalize");
    trust
        .grant(TrustRow {
            workspace_id: "ws".into(),
            resolved_path: resolved.to_string_lossy().to_string(),
            host: "local".into(),
            remote_url: None,
            permission_mode: "supervised".into(),
            scope: "folder".into(),
            trusted_at: 0,
        })
        .await
        .expect("grant");
    sessions
        .create(request(&profile, &root))
        .await
        .expect("trusted workspace admits a session");
}
