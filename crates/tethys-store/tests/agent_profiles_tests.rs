//! Agent-profile store facade tests (M1.12 U1).

use tethys_store::{AgentProfileRow, EventStore};

fn row(id: &str) -> AgentProfileRow {
    AgentProfileRow {
        id: id.to_string(),
        name: format!("Profile {id}"),
        class: "registry".to_string(),
        launch_spec: r#"{"program":"npx","args":["-y","pkg@1.0.0"],"cwd":null,"env":[]}"#
            .to_string(),
        registry_ref: Some(r#"{"id":"claude-acp","version":"1.0.0"}"#.to_string()),
        projection_target: Some("claude-code".to_string()),
        preferred_protocol: Some("V1".to_string()),
        enabled: true,
    }
}

#[tokio::test]
async fn round_trip_through_the_facade() {
    let store = EventStore::in_memory().await.expect("store");
    store.insert_agent_profile(row("a")).await.expect("insert");
    let listed = store.agent_profiles().await.expect("list");
    assert_eq!(listed, vec![row("a")]);
    assert_eq!(store.agent_profile("a").await.expect("get"), Some(row("a")));
}

#[tokio::test]
async fn nullable_columns_round_trip_as_none() {
    let store = EventStore::in_memory().await.expect("store");
    let mut nullable = row("b");
    nullable.registry_ref = None;
    nullable.projection_target = None;
    nullable.preferred_protocol = None;
    store.insert_agent_profile(nullable.clone()).await.expect("insert");
    let stored = store.agent_profile("b").await.expect("get").expect("present");
    assert_eq!(stored.registry_ref, None);
    assert_eq!(stored.projection_target, None);
    assert_eq!(stored.preferred_protocol, None);
}

#[tokio::test]
async fn duplicate_id_conflicts_and_delete_reports_presence() {
    let store = EventStore::in_memory().await.expect("store");
    store.insert_agent_profile(row("a")).await.expect("insert");
    let error = store
        .insert_agent_profile(row("a"))
        .await
        .expect_err("duplicate");
    assert!(matches!(error, tethys_store::StoreError::Conflict(_)));

    assert!(store.delete_agent_profile("a").await.expect("delete"));
    assert!(!store.delete_agent_profile("a").await.expect("delete"));
}
