use tethys_store::{EventStore, ProjectionRow, SkillRow};

fn projection() -> ProjectionRow {
    ProjectionRow {
        target: "claude-code".to_string(),
        path: "/repo/.mcp.json".to_string(),
        scope: "project".to_string(),
        file_hash: "abc123".to_string(),
        created: false,
        updated_at: 1_700_000_000_000,
        entries: r#"{"github":"deadbeef"}"#.to_string(),
    }
}

fn skill() -> SkillRow {
    SkillRow {
        skill_id: "global:pdf".to_string(),
        scope: "global".to_string(),
        name: "pdf".to_string(),
        source: r#"{"origin":"folder"}"#.to_string(),
        pinned_sha: None,
        content_hash: "cafe".to_string(),
        trusted_hash: None,
        enabled: true,
        requires_trust: true,
    }
}

#[tokio::test]
async fn projection_rows_round_trip() {
    let store = EventStore::in_memory().await.expect("store");
    let row = projection();
    store.upsert_projection(row.clone()).await.expect("upsert");
    assert_eq!(
        store
            .projection("claude-code", "/repo/.mcp.json")
            .await
            .expect("get"),
        Some(row.clone())
    );

    let mut updated = row.clone();
    updated.file_hash = "def456".to_string();
    updated.created = true;
    store
        .upsert_projection(updated.clone())
        .await
        .expect("update");
    assert_eq!(
        store
            .projection("claude-code", "/repo/.mcp.json")
            .await
            .expect("get"),
        Some(updated)
    );

    assert!(store
        .delete_projection("claude-code", "/repo/.mcp.json")
        .await
        .expect("delete"));
    assert_eq!(
        store
            .projection("claude-code", "/repo/.mcp.json")
            .await
            .expect("get"),
        None
    );
}

#[tokio::test]
async fn skill_rows_round_trip() {
    let store = EventStore::in_memory().await.expect("store");
    let row = skill();
    store.upsert_skill(row.clone()).await.expect("upsert");
    assert_eq!(
        store.skill("global:pdf").await.expect("get"),
        Some(row.clone())
    );

    let mut trusted = row.clone();
    trusted.trusted_hash = Some(row.content_hash.clone());
    store.upsert_skill(trusted.clone()).await.expect("trust");
    assert_eq!(store.skill("global:pdf").await.expect("get"), Some(trusted));
}
