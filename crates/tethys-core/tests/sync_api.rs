use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::sync::Arc;

use tethys_agent_servers::{ConnectionStore, StoreOptions};
use tethys_api::{McpApi, SkillsApi};
use tethys_core::thread_session::{DenyPermissionResolver, SyncSource, ThreadSessions};
use tethys_core::Core;
use tethys_schema::connection::AcpProtocol;
use tethys_schema::sync::{
    RegistryEntry, RegistryValue, Scope, TargetId, TransportKind, VerifyStatus,
};
use tethys_store::EventStore;
use tethys_sync::MemorySecrets;

async fn core(home: &Path) -> Core {
    let store = EventStore::in_memory().await.expect("store");
    let options = StoreOptions::new(AcpProtocol::V1, Arc::new(DenyPermissionResolver));
    let sessions = Arc::new(ThreadSessions::new(
        ConnectionStore::new(options),
        SyncSource::new(home, Arc::new(MemorySecrets::new())),
    ));
    Core::with_sessions("test", sessions).with_store(Arc::new(store))
}

fn stdio_entry() -> RegistryEntry {
    RegistryEntry {
        transport: TransportKind::Stdio,
        command: Some("github-mcp-server".into()),
        args: vec!["stdio".into()],
        env: BTreeMap::from([(
            "GITHUB_TOKEN".to_string(),
            RegistryValue::secret("keychain:tethys/github"),
        )]),
        url: None,
        headers: BTreeMap::new(),
        meta: Default::default(),
    }
}

#[tokio::test]
async fn mcp_registry_round_trips_and_effective_returns_data() {
    let dir = tempfile::tempdir().expect("tempdir");
    let core = core(dir.path()).await;

    core.mcp_registry_set("github".into(), stdio_entry(), Scope::Global, None)
        .await
        .expect("set");

    let listed = core.mcp_registry_list(None).await.expect("registry_list");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].name, "github");
    assert_eq!(listed[0].scope, Scope::Global);

    let effective = core
        .mcp_effective(TargetId::Session, None)
        .await
        .expect("effective");
    assert_eq!(effective.len(), 1);

    let deleted = core
        .mcp_registry_delete("github".into(), Scope::Global, None)
        .await
        .expect("delete");
    assert!(deleted);
    assert!(core.mcp_registry_list(None).await.expect("list").is_empty());
}

#[tokio::test]
async fn projection_plan_apply_and_rollback_through_the_api() {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().join("home");
    let root = dir.path().join("repo");
    fs::create_dir_all(&home).expect("home");
    fs::create_dir_all(&root).expect("root");
    let core = core(&home).await;

    core.mcp_registry_set(
        "github".into(),
        stdio_entry(),
        Scope::Workspace,
        Some(root.display().to_string()),
    )
    .await
    .expect("set");

    let plan = core
        .mcp_projection_plan(
            TargetId::OpenCode,
            Scope::Workspace,
            root.display().to_string(),
        )
        .await
        .expect("plan");
    assert_eq!(plan.entries.len(), 1);
    assert!(plan.created);

    let applied = core.mcp_projection_apply(plan).await.expect("apply");
    let config = root.join("opencode.json");
    assert!(config.is_file());
    assert_eq!(applied.entries.len(), 1);

    let verified = core
        .mcp_projection_verify(
            TargetId::OpenCode,
            Scope::Workspace,
            root.display().to_string(),
        )
        .await
        .expect("verify");
    assert_eq!(verified, VerifyStatus::InSync);

    let scan = core
        .mcp_import_scan(root.display().to_string())
        .await
        .expect("scan");
    assert!(scan
        .candidates
        .iter()
        .any(|candidate| candidate.name == "github"));

    let pristine = fs::read_to_string(&config).expect("config");
    fs::write(&config, format!("{pristine}\n")).expect("drift");
    let verified = core
        .mcp_projection_verify(
            TargetId::OpenCode,
            Scope::Workspace,
            root.display().to_string(),
        )
        .await
        .expect("verify drifted");
    assert_eq!(verified, VerifyStatus::Drifted);
    fs::write(&config, pristine).expect("restore");

    core.mcp_projection_rollback(
        TargetId::OpenCode,
        Scope::Workspace,
        root.display().to_string(),
    )
    .await
    .expect("rollback");
    assert!(!config.exists());
}

#[tokio::test]
async fn skills_list_trust_and_enable_through_the_api() {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().join("home");
    let root = dir.path().join("repo");
    let skill = root.join(".agents/skills/pdf");
    fs::create_dir_all(skill.join("scripts")).expect("skill dir");
    fs::write(
        skill.join("SKILL.md"),
        "---\nname: pdf\ndescription: test\n---\n",
    )
    .expect("SKILL.md");
    fs::write(skill.join("scripts/run.sh"), "echo hi").expect("script");

    let core = core(&home).await;
    let listed = core
        .skills_list(root.display().to_string())
        .await
        .expect("list");
    assert_eq!(listed.len(), 1);
    assert!(listed[0].requires_trust);
    assert!(!listed[0].trusted);

    let trusted = core
        .skills_trust(root.display().to_string(), Scope::Workspace, "pdf".into())
        .await
        .expect("trust");
    assert!(trusted.trusted);

    let disabled = core
        .skills_enable(
            root.display().to_string(),
            Scope::Workspace,
            "pdf".into(),
            false,
        )
        .await
        .expect("disable");
    assert!(!disabled.enabled);
}

#[tokio::test]
async fn skills_import_folder_through_the_api() {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().join("home");
    let root = dir.path().join("repo");
    let source = dir.path().join("source/pdf");
    fs::create_dir_all(&source).expect("source");
    fs::write(source.join("SKILL.md"), "---\nname: pdf\n---\n").expect("SKILL.md");

    let core = core(&home).await;
    let imported = core
        .skills_import(
            root.display().to_string(),
            Scope::Global,
            tethys_schema::sync::SkillImportSource::Folder {
                path: source.display().to_string(),
            },
        )
        .await
        .expect("import");
    assert_eq!(imported.name, "pdf");
    assert!(home.join(".agents/skills/pdf/SKILL.md").is_file());
}
