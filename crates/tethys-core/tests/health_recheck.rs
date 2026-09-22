//! Health re-check tests (M1.12 U4) over the mock vendor (harness = false so
//! the test binary can re-exec itself as the mock agent).

use std::path::PathBuf;
use std::sync::Arc;

use tethys_agent_servers::{ConnectionStore, LaunchSpec, StoreOptions};
use tethys_core::permission::DenyPermissionResolver;
use tethys_core::thread_session::{SyncSource, ThreadSessions};
use tethys_schema::agents::{AuthState, ProviderHealth};
use tethys_schema::connection::{AcpProtocol, AgentCompat};

fn main() {
    if tethys_acp::mock::run_if_requested() {
        return;
    }
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("runtime");
    runtime.block_on(async {
        missing_binary_is_not_found().await;
        a_mock_handshake_is_healthy_with_capabilities().await;
        declared_auth_methods_do_not_imply_auth_required().await;
        interval_zero_disarms_and_a_positive_value_arms().await;
        recheck_is_scoped_to_one_profile().await;
    });
    println!("health recheck tests passed");
}

fn workdir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("tethys-health-{name}"));
    std::fs::create_dir_all(&dir).expect("workdir");
    dir
}

fn sessions() -> Arc<ThreadSessions> {
    let options = StoreOptions::new(AcpProtocol::V1, Arc::new(DenyPermissionResolver));
    Arc::new(ThreadSessions::new(
        ConnectionStore::new(options),
        SyncSource::new(
            workdir("sync-home"),
            Arc::new(tethys_sync::MemorySecrets::new()),
        ),
        Arc::new(
            tethys_core::workspace_roots::StaticWorkspaces::new()
                .with("workspace", workdir("workspace")),
        ),
    ))
}

fn mock_spec(id: &str) -> LaunchSpec {
    LaunchSpec::new(
        id,
        std::env::current_exe()
            .expect("current exe")
            .to_string_lossy()
            .to_string(),
    )
    .env(tethys_acp::mock::MOCK_ENV, "v1")
}

fn compat() -> AgentCompat {
    AgentCompat {
        preferred_protocol: Some(AcpProtocol::V1),
        ..Default::default()
    }
}

async fn missing_binary_is_not_found() {
    let sessions = sessions();
    let id = sessions.register_profile(
        LaunchSpec::new("m1.12-missing", "definitely-not-a-real-binary-xyz"),
        compat(),
    );
    let key = sessions.connection_key(&id).expect("key");
    sessions.health().recheck(&key).await;
    let record = sessions.health().record(&id);
    assert_eq!(record.health, ProviderHealth::NotFound);
    assert!(record.detail.unwrap_or_default().contains("not installed"));
}

async fn a_mock_handshake_is_healthy_with_capabilities() {
    let sessions = sessions();
    let id = sessions.register_profile(mock_spec("m1.12-healthy"), compat());
    let key = sessions.connection_key(&id).expect("key");
    sessions.health().recheck(&key).await;
    let record = sessions.health().record(&id);
    assert_eq!(record.health, ProviderHealth::Healthy, "{record:?}");
    assert!(record.capabilities.is_some(), "negotiated capabilities");
    assert_eq!(record.protocol, Some(AcpProtocol::V1));
}

async fn declared_auth_methods_do_not_imply_auth_required() {
    let sessions = sessions();
    let id = sessions.register_profile(
        mock_spec("m1.12-auth").env("TETHYS_MOCK_AUTH", "agent"),
        compat(),
    );
    let key = sessions.connection_key(&id).expect("key");
    sessions.health().recheck(&key).await;
    let record = sessions.health().record(&id);
    assert_eq!(record.health, ProviderHealth::Healthy, "{record:?}");
    assert_eq!(record.auth_state, AuthState::Ready);
    assert_eq!(record.auth_methods.len(), 1);
}

async fn interval_zero_disarms_and_a_positive_value_arms() {
    let sessions = sessions();
    let health = sessions.health();
    health.set_interval(0);
    assert_eq!(health.interval_secs(), 0);
    assert!(!health.is_scheduled(), "0 means manual only");

    health.set_interval(300);
    assert_eq!(health.interval_secs(), 300);
    assert!(health.is_scheduled(), "a positive value arms the poller");

    health.set_interval(0);
    assert!(!health.is_scheduled(), "0 disarms again");
}

async fn recheck_is_scoped_to_one_profile() {
    let sessions = sessions();
    let a = sessions.register_profile(mock_spec("m1.12-scope-a"), compat());
    let b = sessions.register_profile(
        LaunchSpec::new("m1.12-scope-b", "definitely-not-a-real-binary-xyz"),
        compat(),
    );
    let key_a = sessions.connection_key(&a).expect("key a");

    sessions.health().recheck(&key_a).await;
    assert_eq!(sessions.health().record(&a).health, ProviderHealth::Healthy);
    assert_eq!(
        sessions.health().record(&b).health,
        ProviderHealth::Unknown,
        "rechecking A must not touch B"
    );
}
