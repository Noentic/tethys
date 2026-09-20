use std::collections::BTreeMap;

use tethys_api::McpApi;
use tethys_schema::sync::{
    EntryMeta, ProjectionPlan, RegistryEntry, Scope, TargetId, TransportKind,
};

use super::{assert_unimplemented, MinimalApi};

fn sample_entry() -> RegistryEntry {
    RegistryEntry {
        transport: TransportKind::Stdio,
        command: Some("cmd".into()),
        args: Vec::new(),
        env: BTreeMap::new(),
        url: None,
        headers: BTreeMap::new(),
        meta: EntryMeta {
            scope: None,
            providers: None,
            targets: None,
            enabled: true,
            legacy: false,
        },
    }
}

fn sample_plan() -> ProjectionPlan {
    ProjectionPlan {
        target: TargetId::Session,
        path: String::new(),
        scope: Scope::Global,
        base_hash: String::new(),
        created: false,
        diff: String::new(),
        content: String::new(),
        entries: Vec::new(),
        providers: Vec::new(),
    }
}

#[tokio::test]
async fn mcp_defaults_return_unimplemented() {
    let api = MinimalApi;
    let workspace = "w1".to_string();
    assert_unimplemented("mcp.registry_list", api.mcp_registry_list(None).await);
    assert_unimplemented(
        "mcp.registry_set",
        api.mcp_registry_set("server".into(), sample_entry(), Scope::Global, None)
            .await,
    );
    assert_unimplemented(
        "mcp.registry_delete",
        api.mcp_registry_delete("server".into(), Scope::Global, None)
            .await,
    );
    assert_unimplemented("mcp.effective", api.mcp_effective(None, None).await);
    assert_unimplemented(
        "mcp.attachments",
        api.mcp_attachments(workspace.clone().into()).await,
    );
    assert_unimplemented(
        "mcp.projection_plan",
        api.mcp_projection_plan(workspace.clone().into(), TargetId::Session, Scope::Global)
            .await,
    );
    assert_unimplemented(
        "mcp.projection_apply",
        api.mcp_projection_apply(
            workspace.clone().into(),
            TargetId::Session,
            Scope::Global,
            sample_plan(),
        )
        .await,
    );
    assert_unimplemented(
        "mcp.projection_rollback",
        api.mcp_projection_rollback(workspace.clone().into(), TargetId::Session, Scope::Global)
            .await,
    );
    assert_unimplemented(
        "mcp.projection_verify",
        api.mcp_projection_verify(workspace.clone().into(), TargetId::Session, Scope::Global)
            .await,
    );
    assert_unimplemented(
        "mcp.import_scan",
        api.mcp_import_scan(workspace.clone().into()).await,
    );
    assert_unimplemented(
        "mcp.import_apply",
        api.mcp_import_apply(workspace.into(), Vec::new(), Scope::Global)
            .await,
    );
    assert_unimplemented("mcp.health", api.mcp_health().await);
}
