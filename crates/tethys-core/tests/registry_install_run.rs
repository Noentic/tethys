//! Install → pin → run a thread, end to end (M1.12 exit criterion).
//!
//! A `binary` registry entry is installed through the real engine from a
//! wiremock-served archive whose executable launches the mock vendor. The
//! registry then "releases" a newer version whose archive no longer exists; the
//! pinned install must still run a thread from the spec stored at install time.

#![cfg(unix)]

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
use tethys_schema::connection::AcpProtocol;
use tethys_schema::thread::{ContentBlock, CreateThread, SessionState, TurnEventBody};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const AGENT_ID: &str = "mock-vendor";
const TOKEN: &str = "pinned-run-token";

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
    let options = StoreOptions::new(AcpProtocol::V1, Arc::new(DenyPermissionResolver));
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

    // Install: the archive is downloaded, verified and extracted, and the spec
    // points at the extracted executable.
    let installed = core
        .agent_registry_install(AGENT_ID.into(), None)
        .await
        .expect("install");
    assert_eq!(installed.version, "1.0.0");
    assert_eq!(installed.warning, None, "a published sha256 needs no warning");
    let program = PathBuf::from(&installed.launch_spec.program);
    assert!(program.exists(), "extracted executable kept on disk");

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
    let thread = core
        .thread_create(CreateThread {
            workspace_id: "workspace".into(),
            agent_profile_id: AGENT_ID.into(),
            workdir: workdir("thread").display().to_string(),
        })
        .await
        .expect("thread from the pinned install")
        .id;
    let mut events = core
        .events_subscribe(thread.clone(), 0)
        .await
        .expect("subscribe");
    core.thread_prompt(thread, vec![ContentBlock::Text(TOKEN.into())])
        .await
        .expect("prompt");

    let mut saw_token = false;
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
                return;
            }
            _ => {}
        }
    }
    panic!("the pinned install never finished its turn (saw token: {saw_token})");
}
