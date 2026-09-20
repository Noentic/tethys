use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::sync::Arc;

use tethys_agent_servers::{ConnectionStore, StoreOptions};
use tethys_api::{ApiError, McpApi, SkillsApi};
use tethys_core::thread_session::{DenyPermissionResolver, SyncSource, ThreadSessions};
use tethys_core::Core;
use tethys_schema::connection::AcpProtocol;
use tethys_schema::sync::{
    RegistryEntry, RegistryValue, Scope, TargetId, TransportKind, VerifyStatus, WorkspaceId,
};
use tethys_store::EventStore;
use tethys_sync::MemorySecrets;

async fn core(home: &Path) -> Core {
    let store = EventStore::in_memory().await.expect("store");
    let options = StoreOptions::new(AcpProtocol::V1, Arc::new(DenyPermissionResolver));
    let sessions = Arc::new(ThreadSessions::with_default_roots(
        ConnectionStore::new(options),
        SyncSource::new(home, Arc::new(MemorySecrets::new())),
    ));
    Core::with_sessions("test", sessions).with_store(Arc::new(store))
}

async fn core_with_workspace(home: &Path, root: &Path) -> (Core, WorkspaceId) {
    let store = EventStore::in_memory().await.expect("store");
    let ws_id = "ws-repo";
    store
        .ensure_workspace(ws_id, &root.display().to_string(), "plain")
        .await
        .expect("ensure");
    let options = StoreOptions::new(AcpProtocol::V1, Arc::new(DenyPermissionResolver));
    let sessions = Arc::new(ThreadSessions::with_default_roots(
        ConnectionStore::new(options),
        SyncSource::new(home, Arc::new(MemorySecrets::new())),
    ));
    let core = Core::with_sessions("test", sessions).with_store(Arc::new(store));
    (core, WorkspaceId::new(ws_id))
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
        .mcp_effective(None, None)
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
    let (core, ws_id) = core_with_workspace(&home, &root).await;

    core.mcp_registry_set(
        "github".into(),
        stdio_entry(),
        Scope::Workspace,
        Some(ws_id.clone()),
    )
    .await
    .expect("set");

    let plan = core
        .mcp_projection_plan(
            ws_id.clone(),
            TargetId::OpenCode,
            Scope::Workspace,
        )
        .await
        .expect("plan");
    assert_eq!(plan.entries.len(), 1);
    assert!(plan.created);

    let applied = core
        .mcp_projection_apply(ws_id.clone(), TargetId::OpenCode, Scope::Workspace, plan)
        .await
        .expect("apply");
    let config = root.join("opencode.json");
    assert!(config.is_file());
    assert_eq!(applied.entries.len(), 1);

    let verified = core
        .mcp_projection_verify(
            ws_id.clone(),
            TargetId::OpenCode,
            Scope::Workspace,
        )
        .await
        .expect("verify");
    assert_eq!(verified, VerifyStatus::InSync);

    let scan = core
        .mcp_import_scan(ws_id.clone())
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
            ws_id.clone(),
            TargetId::OpenCode,
            Scope::Workspace,
        )
        .await
        .expect("verify drifted");
    assert_eq!(verified, VerifyStatus::Drifted);
    fs::write(&config, pristine).expect("restore");

    core.mcp_projection_rollback(
        ws_id.clone(),
        TargetId::OpenCode,
        Scope::Workspace,
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

    let (core, ws_id) = core_with_workspace(&home, &root).await;
    let listed = core
        .skills_list(ws_id.clone())
        .await
        .expect("list");
    assert_eq!(listed.len(), 1);
    assert!(listed[0].requires_trust);
    assert!(!listed[0].trusted);

    let trusted = core
        .skills_trust(ws_id.clone(), Scope::Workspace, "pdf".into())
        .await
        .expect("trust");
    assert!(trusted.trusted);

    let disabled = core
        .skills_enable(
            ws_id.clone(),
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

    let (core, ws_id) = core_with_workspace(&home, &root).await;
    let imported = core
        .skills_import(
            ws_id.clone(),
            Scope::Global,
            tethys_schema::sync::SkillImportSource::Folder {
                path: source.display().to_string(),
            },
        )
        .await
        .expect("import");
    assert_eq!(imported.name, "pdf");
    assert!(home.join(".agents/skills/pdf/SKILL.md").is_file());

    let source_ws = dir.path().join("source/pdf-ws");
    fs::create_dir_all(&source_ws).expect("source ws");
    fs::write(source_ws.join("SKILL.md"), "---\nname: pdf-ws\n---\n").expect("SKILL.md");

    let imported_ws = core
        .skills_import(
            ws_id.clone(),
            Scope::Workspace,
            tethys_schema::sync::SkillImportSource::Folder {
                path: source_ws.display().to_string(),
            },
        )
        .await
        .expect("import ws");
    assert_eq!(imported_ws.name, "pdf-ws");
    assert!(root.join(".agents/skills/pdf-ws/SKILL.md").is_file());

    let err = core
        .skills_import(
            ws_id.clone(),
            Scope::Workspace,
            tethys_schema::sync::SkillImportSource::GitHub {
                spec: "https://gitlab.com/owner/repo".into(),
            },
        )
        .await
        .expect_err("gitlab should error");
    assert!(matches!(err, ApiError::Internal(_)));
}

#[tokio::test]
async fn mcp_attachments_returns_grid_through_core() {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().join("home");
    let root = dir.path().join("repo");
    fs::create_dir_all(&home).expect("home");
    fs::create_dir_all(&root).expect("root");
    let (core, ws_id) = core_with_workspace(&home, &root).await;

    core.mcp_registry_set(
        "github".into(),
        stdio_entry(),
        Scope::Workspace,
        Some(ws_id.clone()),
    )
    .await
    .expect("set github");

    let mut opencode_entry = stdio_entry();
    opencode_entry.meta.providers = Some(vec!["agent-opencode".to_string()]);
    core.mcp_registry_set(
        "opencode-only".into(),
        opencode_entry,
        Scope::Workspace,
        Some(ws_id.clone()),
    )
    .await
    .expect("set opencode-only");

    // Profile 1: agent-1 with stdio
    let p1 = core.register_profile(
        tethys_agent_servers::LaunchSpec::new("agent-1", "/bin/echo"),
        tethys_schema::connection::AgentCompat {
            preferred_protocol: Some(AcpProtocol::V1),
            projection_target: None,
        },
    );
    let key1 = tethys_schema::connection::ConnectionKey::new(&p1, "local");
    core.sessions().store().set_capabilities_for_test(
        &key1,
        Some(tethys_schema::connection::NormalizedCapabilities {
            load_session: true,
            resume: true,
            mcp: tethys_schema::sync::McpTransports {
                stdio: true,
                http: false,
                sse: false,
            },
            prompt_embedded_context: false,
        }),
    );

    // Profile 2: projected Claude Code fallback
    let p2 = core.register_profile(
        tethys_agent_servers::LaunchSpec::new("agent-claude", "/bin/echo"),
        tethys_schema::connection::AgentCompat {
            preferred_protocol: Some(AcpProtocol::V1),
            projection_target: Some(tethys_schema::sync::ProjectionTarget::ClaudeCode),
        },
    );
    let key2 = tethys_schema::connection::ConnectionKey::new(&p2, "local");
    core.sessions().store().set_capabilities_for_test(
        &key2,
        Some(tethys_schema::connection::NormalizedCapabilities {
            load_session: false,
            resume: false,
            mcp: tethys_schema::sync::McpTransports::default(),
            prompt_embedded_context: false,
        }),
    );

    let grid = core.mcp_attachments(ws_id.clone()).await.expect("attachments");
    assert_eq!(grid.servers.len(), 2);
    assert_eq!(grid.providers.len(), 2);

    let cell = |s: &str, p: &str| {
        grid.cells
            .iter()
            .find(|c| c.server_name == s && c.provider_id == p)
            .expect("cell exists")
            .state
            .clone()
    };

    // github on agent-1 -> Attached
    assert_eq!(cell("github", "agent-1"), tethys_schema::sync::AttachmentState::Attached);

    // opencode-only on agent-1 -> Excluded
    assert_eq!(cell("opencode-only", "agent-1"), tethys_schema::sync::AttachmentState::Excluded);

    // github on agent-claude -> FileProjection { target: ClaudeCode, state: Pending }
    assert_eq!(
        cell("github", "agent-claude"),
        tethys_schema::sync::AttachmentState::FileProjection {
            target: tethys_schema::sync::ProjectionTarget::ClaudeCode,
            state: tethys_schema::sync::EntryState::Pending,
        }
    );
}

#[tokio::test]
async fn projection_plan_names_matching_providers_and_handles_unmatched_target() {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().join("home");
    let root = dir.path().join("repo");
    fs::create_dir_all(&home).expect("home");
    fs::create_dir_all(&root).expect("root");
    let (core, ws_id) = core_with_workspace(&home, &root).await;

    core.mcp_registry_set(
        "github".into(),
        stdio_entry(),
        Scope::Workspace,
        Some(ws_id.clone()),
    )
    .await
    .expect("set");

    // Register a profile with projection_target ClaudeCode
    let p_claude = core.register_profile(
        tethys_agent_servers::LaunchSpec::new("claude-profile", "/bin/echo"),
        tethys_schema::connection::AgentCompat {
            preferred_protocol: Some(AcpProtocol::V1),
            projection_target: Some(tethys_schema::sync::ProjectionTarget::ClaudeCode),
        },
    );
    let key_claude = tethys_schema::connection::ConnectionKey::new(&p_claude, "local");
    core.sessions().store().set_capabilities_for_test(
        &key_claude,
        Some(tethys_schema::connection::NormalizedCapabilities {
            load_session: false,
            resume: false,
            mcp: tethys_schema::sync::McpTransports::default(),
            prompt_embedded_context: false,
        }),
    );

    // Plan for ClaudeCode -> providers should contain p_claude
    let claude_plan = core
        .mcp_projection_plan(ws_id.clone(), TargetId::ClaudeCode, Scope::Workspace)
        .await
        .expect("plan claude");
    assert_eq!(claude_plan.providers, vec![p_claude]);

    // Plan for Codex (Global scope) -> no matching profile, providers should be empty
    let codex_plan = core
        .mcp_projection_plan(ws_id.clone(), TargetId::Codex, Scope::Global)
        .await
        .expect("plan codex");
    assert!(codex_plan.providers.is_empty());

    // Plan for OpenCode (Workspace scope) -> no matching profile, providers should be empty
    let opencode_plan = core
        .mcp_projection_plan(ws_id.clone(), TargetId::OpenCode, Scope::Workspace)
        .await
        .expect("plan opencode");
    assert!(opencode_plan.providers.is_empty());

    // Attachment grid should not have any FileProjection cell targeting Codex
    let grid = core.mcp_attachments(ws_id.clone()).await.expect("attachments");
    let mut saw_claude_projection = false;
    for cell in &grid.cells {
        if let tethys_schema::sync::AttachmentState::FileProjection { target, .. } = &cell.state {
            assert_ne!(*target, tethys_schema::sync::ProjectionTarget::Codex);
            if *target == tethys_schema::sync::ProjectionTarget::ClaudeCode {
                saw_claude_projection = true;
            }
        }
    }
    assert!(saw_claude_projection);
}

