//! `workspace_trust` accessor round-trip (M1.16 U1).

use tethys_store::{EventStore, TrustRow};

fn row(workspace_id: &str, resolved_path: &str) -> TrustRow {
    TrustRow {
        workspace_id: workspace_id.to_string(),
        resolved_path: resolved_path.to_string(),
        host: "local".to_string(),
        remote_url: Some("https://github.com/x/y.git".to_string()),
        permission_mode: "auto-edit".to_string(),
        scope: "subtree".to_string(),
        trusted_at: 42,
    }
}

#[tokio::test]
async fn grant_read_revoke_round_trip() {
    let store = EventStore::in_memory().await.expect("store");
    store
        .ensure_workspace("w1", "/tmp/w1", "worktree")
        .await
        .expect("ensure");

    let trust = row("w1", "/tmp/w1");
    store.upsert_trust(trust.clone()).await.expect("grant");
    assert_eq!(store.trust("w1").await.expect("trust"), Some(trust.clone()));

    assert!(store.delete_trust("w1").await.expect("revoke"));
    assert!(store.trust("w1").await.expect("trust").is_none());

    // A second grant re-inserts.
    store.upsert_trust(trust.clone()).await.expect("regrant");
    assert_eq!(store.list_trust().await.expect("list"), vec![trust]);
}

#[tokio::test]
async fn the_unique_key_rejects_a_second_workspace_for_the_same_folder() {
    let store = EventStore::in_memory().await.expect("store");
    store
        .ensure_workspace("w1", "/tmp/w1", "worktree")
        .await
        .expect("ensure w1");
    store
        .ensure_workspace("w2", "/tmp/w2", "worktree")
        .await
        .expect("ensure w2");

    store
        .upsert_trust(row("w1", "/tmp/same"))
        .await
        .expect("first grant");

    // Same `(resolved_path, host)`, different workspace id: the unique index
    // rejects the fork rather than silently trusting one folder twice.
    let duplicate = store.upsert_trust(row("w2", "/tmp/same")).await;
    assert!(duplicate.is_err(), "duplicate trust key must be rejected");
}
