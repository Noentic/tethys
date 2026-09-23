//! Install → pin → run a thread, end to end (M1.12 exit criterion).
//!
//! A `binary` registry entry is installed through the real engine from a
//! wiremock-served archive whose executable launches the mock vendor. The
//! registry then "releases" a newer version whose archive no longer exists; the
//! pinned install must still run a thread from the spec stored at install time.

#![cfg(unix)]

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use flate2::write::GzEncoder;
use flate2::Compression;
use futures::stream::StreamExt;
use tethys_acp::mock::MOCK_ENV;
use tethys_agent_servers::registry::platform::host_platform_key;
use tethys_agent_servers::registry::{Registry, RegistryError, RegistrySource};
use tethys_agent_servers::{ConnectionStore, StoreOptions};
use tethys_api::{AgentApi, EventsApi, ThreadApi};
use tethys_core::permission::DenyPermissionResolver;
use tethys_core::thread_session::{SyncSource, ThreadSessions};
use tethys_core::Core;
use tethys_schema::agents::UpdateAvailability;
use tethys_schema::connection::{AcpProtocol, ConnectionKey};
use tethys_schema::elicitation::{
    ElicitationOutcome, ElicitationRequest, ElicitationResponse, ElicitationValue,
};
use tethys_schema::thread::{ContentBlock, CreateThread, SessionState, ThreadId, TurnEventBody};
use tethys_thread::{ElicitationResolver, SessionId};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const AGENT_ID: &str = "mock-vendor";
const TOKEN: &str = "pinned-run-token";

/// Answers the mock's form elicitation without a UI, proving the shared
/// resolver path works for a standards-only agent.
struct AutoElicit;

#[async_trait]
impl ElicitationResolver for AutoElicit {
    async fn resolve(
        &self,
        _session: &SessionId,
        request: ElicitationRequest,
    ) -> ElicitationResponse {
        let values = request
            .fields
            .iter()
            .any(|field| field.key == "name")
            .then(|| {
                BTreeMap::from([("name".to_string(), ElicitationValue::Text("tethys".into()))])
            })
            .unwrap_or_default();
        ElicitationResponse::accepted(request.req_id, values)
    }
}

/// Sends one prompt and collects normalized events until the turn goes idle.
async fn prompt_and_collect(
    core: &Core,
    id: &ThreadId,
    events: &mut tethys_api::EventStream,
    text: &str,
) -> Vec<TurnEventBody> {
    core.thread_prompt(id.clone(), vec![ContentBlock::Text(text.into())])
        .await
        .expect("prompt");
    let mut bodies = Vec::new();
    for _ in 0..512 {
        let event = tokio::time::timeout(Duration::from_secs(10), events.next())
            .await
            .expect("event within timeout")
            .expect("stream open");
        let body = event.event;
        let idle = matches!(
            &body,
            TurnEventBody::StateChanged(changed)
                if matches!(changed.state, SessionState::Idle { .. })
        );
        bodies.push(body);
        if idle {
            break;
        }
    }
    bodies
}

fn main() {
    if tethys_acp::mock::run_if_requested() {
        return;
    }
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("runtime");
    runtime.block_on(run());
    println!("registry install run tests passed");
}

/// A registry document that can be swapped to simulate an upstream release.
struct SwappableSource(Arc<Mutex<Registry>>);

#[async_trait]
impl RegistrySource for SwappableSource {
    async fn fetch(&self) -> Result<Registry, RegistryError> {
        Ok(self.0.lock().expect("lock").clone())
    }
}

fn registry(version: &str, archive: &str, sha256: &str) -> Registry {
    let platform = host_platform_key().expect("host platform is a registry platform");
    serde_json::from_value(serde_json::json!({
        "version": "1.0.0",
        "agents": [{
            "id": AGENT_ID,
            "name": "Mock Vendor",
            "version": version,
            "distribution": { "binary": { platform: {
                "archive": archive,
                "sha256": sha256,
                "cmd": "./agent",
                // The registry, not the test, tells the installed binary to act
                // as the mock vendor.
                "env": { MOCK_ENV: "v1" },
            }}},
        }],
        "extensions": [],
    }))
    .expect("registry")
}

/// A `.tar.gz` holding one executable that re-executes this test binary.
fn agent_archive() -> Vec<u8> {
    let exe = std::env::current_exe().expect("exe");
    let script = format!("#!/bin/sh\nexec \"{}\" \"$@\"\n", exe.display());
    let mut builder = tar::Builder::new(GzEncoder::new(Vec::new(), Compression::default()));
    let mut header = tar::Header::new_gnu();
    header.set_size(script.len() as u64);
    header.set_mode(0o755);
    header.set_cksum();
    builder
        .append_data(&mut header, "agent", script.as_bytes())
        .expect("append");
    builder
        .into_inner()
        .expect("encoder")
        .finish()
        .expect("finish")
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn workdir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("tethys-registry-run-{name}"));
    std::fs::create_dir_all(&dir).expect("workdir");
    dir
}

async fn run() {
    let home = tempfile::tempdir().expect("home");
    let archive = agent_archive();
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/agent-1.0.0.tar.gz"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(archive.clone()))
        .mount(&server)
        .await;
    // `/agent-1.1.0.tar.gz` is deliberately never served.

    let source = Arc::new(SwappableSource(Arc::new(Mutex::new(registry(
        "1.0.0",
        &format!("{}/agent-1.0.0.tar.gz", server.uri()),
        &sha256_hex(&archive),
    )))));

    let store = Arc::new(
        tethys_store::EventStore::open(home.path().join("state.db"))
            .await
            .expect("store"),
    );
    let mut options = StoreOptions::new(AcpProtocol::V1, Arc::new(DenyPermissionResolver));
    assert!(
        options.provider_integrations.get(AGENT_ID).is_none(),
        "the standards-only fixture must not need a Provider descriptor"
    );
    options.client_services = options
        .client_services
        .with_elicitation(Arc::new(AutoElicit));
    let sessions = Arc::new(ThreadSessions::new(
        ConnectionStore::new(options),
        SyncSource::new(home.path(), Arc::new(tethys_sync::MemorySecrets::new())),
        Arc::new(
            tethys_core::workspace_roots::StaticWorkspaces::new()
                .with("workspace", workdir("workspace")),
        ),
    ));
    let core = Core::with_sessions("test", sessions)
        .with_store(store.clone())
        .with_registry_source(source.clone());
    store
        .ensure_workspace(
            "workspace",
            &workdir("workspace").display().to_string(),
            "worktree",
        )
        .await
        .expect("workspace row");
    // M1.16's trust gate: the roots resolver refuses an untrusted workspace.
    store
        .upsert_trust(tethys_store::TrustRow {
            workspace_id: "workspace".into(),
            resolved_path: workdir("workspace")
                .canonicalize()
                .expect("canonicalize")
                .to_string_lossy()
                .to_string(),
            host: "local".into(),
            remote_url: None,
            permission_mode: "supervised".into(),
            scope: "folder".into(),
            trusted_at: 0,
        })
        .await
        .expect("trust");
    store
        .ensure_workspace("extra", &workdir("extra").display().to_string(), "worktree")
        .await
        .expect("additional workspace row");
    store
        .upsert_trust(tethys_store::TrustRow {
            workspace_id: "extra".into(),
            resolved_path: workdir("extra")
                .canonicalize()
                .expect("canonicalize")
                .to_string_lossy()
                .to_string(),
            host: "local".into(),
            remote_url: None,
            permission_mode: "supervised".into(),
            scope: "folder".into(),
            trusted_at: 0,
        })
        .await
        .expect("additional trust");

    // Install: the archive is downloaded, verified and extracted, and the spec
    // points at the extracted executable.
    let installed = core
        .agent_registry_install(AGENT_ID.into(), None)
        .await
        .expect("install");
    assert_eq!(installed.version, "1.0.0");
    assert_eq!(
        installed.warning, None,
        "a published sha256 needs no warning"
    );
    let program = PathBuf::from(&installed.launch_spec.program);
    assert!(program.exists(), "extracted executable kept on disk");
    let lease = core
        .sessions()
        .store()
        .acquire(&ConnectionKey::new(AGENT_ID, "local"))
        .await
        .expect("unknown standards-only registry agent connects");
    assert_eq!(lease.connection().integration_id(), Some(AGENT_ID));
    drop(lease);

    // The registry moves on to a release whose archive is gone.
    {
        let mut document = source.0.lock().expect("lock");
        *document = registry(
            "1.1.0",
            &format!("{}/agent-1.1.0.tar.gz", server.uri()),
            &sha256_hex(b"unpublished"),
        );
    }
    let listed = core.agent_registry_list().await.expect("registry list");
    let entry = listed.iter().find(|e| e.id == AGENT_ID).expect("entry");
    assert_eq!(entry.pinned_version.as_deref(), Some("1.0.0"));
    assert_eq!(
        entry.update,
        Some(UpdateAvailability::Available {
            latest: "1.1.0".into()
        }),
        "the release is offered, never applied"
    );

    // Run: a thread on the pinned install echoes its prompt through the mock.
    std::fs::write(workdir("extra").join("probe.txt"), "root-probe").expect("probe");
    let bootstrap = core
        .thread_prepare(CreateThread {
            workspace_id: "workspace".into(),
            agent_profile_id: AGENT_ID.into(),
            workdir: workdir("thread").display().to_string(),
            additional_directories: vec!["extra".into()],
            isolation: None,
        })
        .await
        .expect("thread from the pinned install");
    let thread = bootstrap.thread.id;
    let mut events = core
        .events_subscribe(thread.clone(), bootstrap.latest_seq)
        .await
        .expect("subscribe");
    core.thread_prompt(thread.clone(), vec![ContentBlock::Text(TOKEN.into())])
        .await
        .expect("prompt");

    let mut saw_token = false;
    let mut saw_idle = false;
    for _ in 0..512 {
        let event = tokio::time::timeout(Duration::from_secs(10), events.next())
            .await
            .expect("event within timeout")
            .expect("stream open");
        match &event.event {
            TurnEventBody::MessageChunk(chunk) => {
                if let ContentBlock::Text(text) = &chunk.block {
                    saw_token |= text.contains(TOKEN);
                }
            }
            TurnEventBody::StateChanged(changed)
                if saw_token && matches!(changed.state, SessionState::Idle { .. }) =>
            {
                saw_idle = true;
                break;
            }
            _ => {}
        }
    }
    assert!(saw_token, "the pinned install never echoed its turn");
    assert!(saw_idle, "the pinned install never completed its turn");

    // The same standards-only fixture completes every advertised callback.
    let permission = prompt_and_collect(&core, &thread, &mut events, "permission").await;
    assert!(
        permission
            .iter()
            .any(|body| matches!(body, TurnEventBody::PermissionRequested(_))),
        "permission request never reached the client: {permission:?}"
    );
    assert!(
        permission
            .iter()
            .any(|body| matches!(body, TurnEventBody::PermissionResolved { .. })),
        "permission resolution never reached the event stream: {permission:?}"
    );

    let elicitation = prompt_and_collect(&core, &thread, &mut events, "elicit-form").await;
    assert!(
        elicitation
            .iter()
            .any(|body| matches!(body, TurnEventBody::ElicitationRequested(_))),
        "elicitation request never reached the client: {elicitation:?}"
    );
    assert!(
        elicitation.iter().any(|body| matches!(
            body,
            TurnEventBody::ElicitationResolved { outcome, values, .. }
                if *outcome == ElicitationOutcome::Accepted && values.contains_key("name")
        )),
        "elicitation answer never reached the event stream: {elicitation:?}"
    );

    let terminal = prompt_and_collect(&core, &thread, &mut events, "terminal-lifecycle").await;
    assert!(
        terminal.iter().any(|body| matches!(
            body,
            TurnEventBody::TerminalOutputChunk { bytes, .. } if bytes.contains("terminal-ok")
        )),
        "terminal lifecycle never reported output: {terminal:?}"
    );

    let filesystem = prompt_and_collect(&core, &thread, &mut events, "fs/read").await;
    assert!(
        filesystem.iter().any(|body| matches!(
            body,
            TurnEventBody::MessageChunk(chunk)
                if matches!(&chunk.block, ContentBlock::Text(text) if text.contains("probe:root-probe"))
        )),
        "filesystem callback never returned the additional-directory probe: {filesystem:?}"
    );

    core.thread_delete(thread).await.expect("delete thread");
    core.agent_profiles_delete(AGENT_ID.into())
        .await
        .expect("delete installed profile");
    assert!(core
        .agent_profiles_list()
        .await
        .expect("profiles")
        .into_iter()
        .all(|profile| profile.id != AGENT_ID));
}
