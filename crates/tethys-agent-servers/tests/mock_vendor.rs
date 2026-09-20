//! Spawn-a-real-process store scenarios driven by the re-executed mock agent.
//!
//! When `TETHYS_MOCK_ACP` is set this process becomes the mock vendor agent the
//! parent test spawns; otherwise it runs the connection-store tests directly
//! (`harness = false`).

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use async_trait::async_trait;

use tethys_acp::mock::MOCK_ENV;
use tethys_agent_servers::{
    ConnectionStore, EnvResolver, LaunchSpec, RecoveryOutcome, StoreError, StoreOptions,
};
use tethys_schema::connection::{AcpProtocol, AgentCompat, ConnectionKey, ConnectionState};
use tethys_schema::thread::{Decider, PermOutcome, PermissionRequested};
use tethys_thread::{AgentConnection, NewSession, PermissionDecision, PermissionResolver, SessionId};

const IDLE_GRACE: Duration = Duration::from_millis(50);
const CANCEL_GRACE: Duration = Duration::from_millis(500);

struct ApproveAll;

#[async_trait]
impl PermissionResolver for ApproveAll {
    async fn resolve(&self, _session: &SessionId, _request: PermissionRequested) -> PermissionDecision {
        PermissionDecision {
            outcome: PermOutcome::Approved,
            option_id: Some("allow".to_string()),
            decided_by: Decider::Policy,
        }
    }
}

fn store() -> Arc<ConnectionStore> {
    let mut options = StoreOptions::new(AcpProtocol::V1, Arc::new(ApproveAll));
    options.idle_grace = IDLE_GRACE;
    options.cancel_grace = CANCEL_GRACE;
    ConnectionStore::new(options)
}

fn register(
    store: &ConnectionStore,
    profile: &str,
    mock: &str,
    cwd: &Path,
    compat: AgentCompat,
) -> ConnectionKey {
    let program = std::env::current_exe()
        .expect("current exe")
        .to_string_lossy()
        .into_owned();
    let spec = LaunchSpec::new(profile, program)
        .cwd(cwd)
        .env(MOCK_ENV, mock);
    store.register(spec, compat)
}

fn workdir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "tethys-agent-servers-{}-{name}",
        std::process::id()
    ));
    std::fs::create_dir_all(&dir).expect("create workdir");
    dir
}

fn session_request(cwd: &Path) -> NewSession {
    NewSession {
        cwd: cwd.to_path_buf(),
        additional_directories: Vec::new(),
        mcp_servers: Vec::new(),
    }
}

async fn wait_until(mut condition: impl FnMut() -> bool, deadline: Duration) {
    let start = Instant::now();
    while !condition() {
        assert!(
            start.elapsed() < deadline,
            "condition not met within {deadline:?}"
        );
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

#[cfg(unix)]
async fn process_group_gone(pgid: u32) -> bool {
    let deadline = Instant::now() + Duration::from_secs(1);
    loop {
        let result = unsafe { libc::kill(-(pgid as i32), 0) };
        if result != 0 {
            let error = std::io::Error::last_os_error();
            if error.raw_os_error() == Some(libc::ESRCH) {
                return true;
            }
        }
        if Instant::now() >= deadline {
            return false;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

async fn run_limited<F: std::future::Future<Output = ()>>(label: &str, future: F) {
    if tokio::time::timeout(Duration::from_secs(5), future)
        .await
        .is_err()
    {
        panic!("{label} timed out");
    }
}

async fn leases_share_one_process_and_idle_reap_kills_the_process_group() {
    let dir = workdir("lease-reap");
    let store = store();
    let key = register(&store, "lease-reap", "v1", &dir, AgentCompat::default());

    let first = store.acquire(&key).await.expect("first lease");
    let second = store.acquire(&key).await.expect("second lease");

    assert!(Arc::ptr_eq(first.connection(), second.connection()));
    assert_eq!(store.spawns(&key), 1);

    let rows = store.entries();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].state, ConnectionState::Connected);
    assert_eq!(rows[0].restarts, 0);
    let pid = rows[0].pid.expect("connected pid");

    drop(first);
    drop(second);
    assert_eq!(store.entries()[0].state, ConnectionState::Draining);
    assert_eq!(store.reap_idle().await, 0);

    tokio::time::sleep(IDLE_GRACE + Duration::from_millis(30)).await;
    assert_eq!(store.reap_idle().await, 1);
    assert!(store.entries().is_empty());

    #[cfg(unix)]
    assert!(
        process_group_gone(pid).await,
        "process group {pid} survived idle reap"
    );
    #[cfg(not(unix))]
    let _ = pid;
}

async fn acquiring_after_reap_respawns_and_counts_restarts() {
    let dir = workdir("respawn");
    let store = store();
    let key = register(&store, "respawn", "v1", &dir, AgentCompat::default());

    let lease = store.acquire(&key).await.expect("first lease");
    assert_eq!(store.spawns(&key), 1);
    drop(lease);

    tokio::time::sleep(IDLE_GRACE + Duration::from_millis(30)).await;
    assert_eq!(store.reap_idle().await, 1);

    let lease = store.acquire(&key).await.expect("respawned lease");
    let rows = store.entries();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].state, ConnectionState::Connected);
    assert_eq!(store.spawns(&key), 2);
    assert_eq!(rows[0].restarts, 1);

    drop(lease);
    store.restart(&key).await.expect("cleanup restart");
}

async fn transport_death_marks_error_and_next_acquire_respawns() {
    let dir = workdir("transport-death");
    let store = store();
    let key = register(
        &store,
        "transport-death",
        "v1",
        &dir,
        AgentCompat::default(),
    );

    let lease = store.acquire(&key).await.expect("lease");
    assert_eq!(store.entries()[0].state, ConnectionState::Connected);

    store.restart(&key).await.expect("restart");
    wait_until(
        || {
            store
                .entries()
                .first()
                .is_some_and(|row| row.state == ConnectionState::Error)
        },
        Duration::from_secs(1),
    )
    .await;
    drop(lease);

    let lease = store.acquire(&key).await.expect("respawned lease");
    let rows = store.entries();
    assert_eq!(rows[0].state, ConnectionState::Connected);
    assert_eq!(store.spawns(&key), 2);
    assert!(rows[0].restarts >= 1);

    drop(lease);
    store.restart(&key).await.expect("cleanup restart");
}

#[cfg(unix)]
async fn dead_process_marks_error_and_next_acquire_respawns() {
    let dir = workdir("dead-process");
    let store = store();
    let key = register(&store, "dead-process", "v1", &dir, AgentCompat::default());

    let lease = store.acquire(&key).await.expect("lease");
    let pid = store.entries()[0].pid.expect("pid");
    assert_eq!(store.entries()[0].state, ConnectionState::Connected);

    unsafe {
        libc::kill(-(pid as i32), libc::SIGKILL);
    }

    wait_until(
        || {
            store
                .entries()
                .first()
                .is_some_and(|row| row.state == ConnectionState::Error)
        },
        Duration::from_secs(1),
    )
    .await;
    assert!(store.entries()[0].stale);
    drop(lease);

    let lease = store.acquire(&key).await.expect("respawned lease");
    assert_eq!(store.entries()[0].state, ConnectionState::Connected);
    assert_eq!(store.spawns(&key), 2);
    assert!(store.entries()[0].restarts >= 1);

    drop(lease);
    store.restart(&key).await.expect("cleanup restart");
}

async fn concurrent_acquires_spawn_once_and_create_distinct_sessions() {
    let dir_a = workdir("concurrent-a");
    let dir_b = workdir("concurrent-b");
    let store = store();
    let key = register(&store, "concurrent", "v1", &dir_a, AgentCompat::default());

    let (left, right) = tokio::join!(store.acquire(&key), store.acquire(&key));
    let left = left.expect("left lease");
    let right = right.expect("right lease");

    assert!(Arc::ptr_eq(left.connection(), right.connection()));
    assert_eq!(store.spawns(&key), 1);

    let first = left
        .connection()
        .new_session(session_request(&dir_a))
        .await
        .expect("first session");
    let second = right
        .connection()
        .new_session(session_request(&dir_b))
        .await
        .expect("second session");

    assert_ne!(first.id, second.id);
    assert_eq!(store.spawns(&key), 1);

    drop(left);
    drop(right);
    store.restart(&key).await.expect("cleanup restart");
}

async fn recovery_cancels_live_session_and_restarts_after_transport_loss() {
    let dir = workdir("recovery-v1");
    let store = store();
    let key = register(&store, "recovery-v1", "v1", &dir, AgentCompat::default());

    let lease = store.acquire(&key).await.expect("lease");
    let session = lease
        .connection()
        .new_session(session_request(&dir))
        .await
        .expect("session");

    let outcome = store
        .recover(&key, &session.id, &dir, Vec::new(), true)
        .await
        .expect("live recovery");
    assert_eq!(outcome, RecoveryOutcome::Cancelled);

    store.restart(&key).await.expect("restart");
    wait_until(
        || {
            store
                .entries()
                .first()
                .is_some_and(|row| row.state == ConnectionState::Error)
        },
        Duration::from_secs(1),
    )
    .await;
    drop(lease);

    // No live connection remains: recover respawns. That normally yields
    // ProcessRestarted; Interrupted only when the respawn itself fails.
    let outcome = store
        .recover(&key, &session.id, &dir, Vec::new(), true)
        .await
        .expect("dead recovery");
    assert!(matches!(
        outcome,
        RecoveryOutcome::ProcessRestarted | RecoveryOutcome::Interrupted
    ));

    store.restart(&key).await.expect("cleanup restart");
}

#[cfg(feature = "acp-v2")]
async fn v2_recovery_cancels_live_session_and_restarts_dead_connection() {
    let dir = workdir("recovery-v2");
    let store = store();
    let compat = AgentCompat {
        preferred_protocol: Some(AcpProtocol::V2),
        projection_target: None,
    };
    let key = register(&store, "recovery-v2", "v2", &dir, compat);

    let lease = store.acquire(&key).await.expect("v2 lease");
    assert_eq!(store.entries()[0].protocol, Some(AcpProtocol::V2));
    let session = lease
        .connection()
        .new_session(session_request(&dir))
        .await
        .expect("v2 session");

    let outcome = store
        .recover(&key, &session.id, &dir, Vec::new(), false)
        .await
        .expect("live v2 recovery");
    assert_eq!(outcome, RecoveryOutcome::Cancelled);

    store.restart(&key).await.expect("restart");
    wait_until(
        || {
            store
                .entries()
                .first()
                .is_some_and(|row| row.state == ConnectionState::Error)
        },
        Duration::from_secs(1),
    )
    .await;
    drop(lease);

    let outcome = store
        .recover(&key, &session.id, &dir, Vec::new(), false)
        .await
        .expect("dead v2 recovery");
    assert_eq!(outcome, RecoveryOutcome::ProcessRestarted);

    store.restart(&key).await.expect("cleanup restart");
}

/// Records every binding it is asked to resolve; `ref:missing` cannot be
/// resolved and any other `ref:x` resolves to `x`.
struct RecordingEnv(Mutex<Vec<(String, String)>>);

impl EnvResolver for RecordingEnv {
    fn resolve(&self, name: &str, value: &str) -> Result<String, String> {
        self.0
            .lock()
            .expect("lock")
            .push((name.to_string(), value.to_string()));
        match value.strip_prefix("ref:") {
            Some("missing") => Err(format!("the secret for {name} is missing")),
            Some(resolved) => Ok(resolved.to_string()),
            None => Ok(value.to_string()),
        }
    }
}

async fn env_bindings_go_through_the_resolver_and_a_failure_stops_the_launch() {
    let resolver = Arc::new(RecordingEnv(Mutex::new(Vec::new())));
    let mut options = StoreOptions::new(AcpProtocol::V1, Arc::new(ApproveAll));
    options.env_resolver = resolver.clone();
    let store = ConnectionStore::new(options);
    let dir = workdir("env-resolver");
    let program = std::env::current_exe()
        .expect("current exe")
        .to_string_lossy()
        .into_owned();

    let resolvable = store.register(
        LaunchSpec::new("env-ok", program.clone())
            .cwd(&dir)
            .env(MOCK_ENV, "v1")
            .env("API_KEY", "ref:s3cret"),
        AgentCompat::default(),
    );
    let lease = store.acquire(&resolvable).await.expect("resolvable spawn");
    drop(lease);
    assert!(
        resolver
            .0
            .lock()
            .expect("lock")
            .contains(&("API_KEY".to_string(), "ref:s3cret".to_string())),
        "the spawn asked the resolver for the binding"
    );

    let unresolvable = store.register(
        LaunchSpec::new("env-missing", program)
            .cwd(&dir)
            .env(MOCK_ENV, "v1")
            .env("API_KEY", "ref:missing"),
        AgentCompat::default(),
    );
    match store.acquire(&unresolvable).await {
        Err(StoreError::Spawn(message)) => {
            assert!(message.contains("missing"), "{message}");
            assert!(!message.contains("ref:"), "the reference is not echoed");
        }
        Err(other) => panic!("expected a spawn failure, got {other}"),
        Ok(_) => panic!("an unresolvable binding must not launch the agent"),
    }
}

async fn a_re_registered_spec_applies_to_the_next_spawn() {
    let resolver = Arc::new(RecordingEnv(Mutex::new(Vec::new())));
    let mut options = StoreOptions::new(AcpProtocol::V1, Arc::new(ApproveAll));
    options.env_resolver = resolver.clone();
    let store = ConnectionStore::new(options);
    let dir = workdir("re-register");
    let program = std::env::current_exe()
        .expect("current exe")
        .to_string_lossy()
        .into_owned();
    let spec = |binding: &str| {
        LaunchSpec::new("edited", program.clone())
            .cwd(&dir)
            .env(MOCK_ENV, "v1")
            .env(binding, "1")
    };

    let key = store.register(spec("BEFORE"), AgentCompat::default());
    let in_use = store.acquire(&key).await.expect("first spawn");

    // A profile edit (or a registry update) registers the same profile again.
    store.register(spec("AFTER"), AgentCompat::default());
    assert!(
        !store.retire_idle(&key).await,
        "an edit must not kill a connection that is in use"
    );

    drop(in_use);
    assert!(store.retire_idle(&key).await, "an unused connection retires");
    drop(store.acquire(&key).await.expect("second spawn"));

    let asked: Vec<String> = resolver
        .0
        .lock()
        .expect("lock")
        .iter()
        .map(|(name, _)| name.clone())
        .collect();
    assert!(asked.contains(&"BEFORE".to_string()), "{asked:?}");
    assert!(
        asked.contains(&"AFTER".to_string()),
        "the edited spec was never used: {asked:?}"
    );
}

fn main() {
    if tethys_acp::mock::run_if_requested() {
        return;
    }

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("tokio runtime");

    runtime.block_on(async {
        run_limited(
            "env_bindings_go_through_the_resolver_and_a_failure_stops_the_launch",
            env_bindings_go_through_the_resolver_and_a_failure_stops_the_launch(),
        )
        .await;
        run_limited(
            "a_re_registered_spec_applies_to_the_next_spawn",
            a_re_registered_spec_applies_to_the_next_spawn(),
        )
        .await;
        run_limited(
            "leases_share_one_process_and_idle_reap_kills_the_process_group",
            leases_share_one_process_and_idle_reap_kills_the_process_group(),
        )
        .await;
        run_limited(
            "acquiring_after_reap_respawns_and_counts_restarts",
            acquiring_after_reap_respawns_and_counts_restarts(),
        )
        .await;
        run_limited(
            "transport_death_marks_error_and_next_acquire_respawns",
            transport_death_marks_error_and_next_acquire_respawns(),
        )
        .await;
        #[cfg(unix)]
        run_limited(
            "dead_process_marks_error_and_next_acquire_respawns",
            dead_process_marks_error_and_next_acquire_respawns(),
        )
        .await;
        run_limited(
            "concurrent_acquires_spawn_once_and_create_distinct_sessions",
            concurrent_acquires_spawn_once_and_create_distinct_sessions(),
        )
        .await;
        run_limited(
            "recovery_cancels_live_session_and_restarts_after_transport_loss",
            recovery_cancels_live_session_and_restarts_after_transport_loss(),
        )
        .await;
        #[cfg(feature = "acp-v2")]
        run_limited(
            "v2_recovery_cancels_live_session_and_restarts_dead_connection",
            v2_recovery_cancels_live_session_and_restarts_dead_connection(),
        )
        .await;
    });

    println!("mock_vendor tests passed");
}
