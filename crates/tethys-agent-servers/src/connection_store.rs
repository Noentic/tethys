use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, Weak};
use std::time::{Duration, Instant};

use agent_client_protocol::ByteStreams;
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

use tethys_acp::{AcpConnectOptions, AcpConnection};
use tethys_schema::connection::{
    AcpProtocol, AgentCompat, AgentInfo, ConnectionEntry, ConnectionKey, ConnectionState,
    NormalizedCapabilities,
};
use tethys_supervisor::SupervisedChild;
use tethys_thread::{AgentConnection, ElicitationResolver, PermissionResolver};

use crate::launch::LaunchSpec;

pub struct StoreOptions {
    pub protocol: AcpProtocol,
    pub client_name: String,
    pub permission_resolver: Arc<dyn PermissionResolver>,
    pub elicitation_resolver: Arc<dyn ElicitationResolver>,
    pub idle_grace: Duration,
    pub cancel_grace: Duration,
}

impl StoreOptions {
    pub fn new(protocol: AcpProtocol, permission_resolver: Arc<dyn PermissionResolver>) -> Self {
        Self {
            protocol,
            client_name: "tethys".to_string(),
            permission_resolver,
            elicitation_resolver: Arc::new(tethys_acp::client::NoopElicitationResolver),
            idle_grace: Duration::from_secs(30),
            cancel_grace: Duration::from_secs(5),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("unknown profile: {0}")]
    UnknownProfile(String),
    #[error("spawn failed: {0}")]
    Spawn(String),
    #[error("connect failed: {0}")]
    Connect(String),
    #[error("recovery failed: {0}")]
    Recovery(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryOutcome {
    Cancelled,
    SessionResumed,
    ProcessRestarted,
    Interrupted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Lifecycle {
    Connecting,
    Connected,
    Error,
    Draining,
    Terminated,
}

impl Lifecycle {
    fn exposed(self) -> Option<ConnectionState> {
        match self {
            Lifecycle::Connecting => Some(ConnectionState::Connecting),
            Lifecycle::Connected => Some(ConnectionState::Connected),
            Lifecycle::Error => Some(ConnectionState::Error),
            Lifecycle::Draining => Some(ConnectionState::Draining),
            Lifecycle::Terminated => None,
        }
    }
}

struct Entry {
    key: ConnectionKey,
    spec: LaunchSpec,
    compat: AgentCompat,
    state: Lifecycle,
    protocol: Option<AcpProtocol>,
    info: Option<AgentInfo>,
    capabilities: Option<NormalizedCapabilities>,
    pid: Option<u32>,
    restarts: u32,
    spawn_count: u32,
    leases: u32,
    last_active: Instant,
    child: Option<SupervisedChild>,
    connection: Option<Arc<AcpConnection>>,
}

struct Spawned {
    child: SupervisedChild,
    connection: Arc<AcpConnection>,
    pid: u32,
}

struct PendingSpawn {
    spec: LaunchSpec,
    compat: AgentCompat,
    child: Option<SupervisedChild>,
    connection: Option<Arc<AcpConnection>>,
}

pub struct ConnectionStore {
    options: StoreOptions,
    entries: Mutex<HashMap<ConnectionKey, Entry>>,
    connect_guard: tokio::sync::Mutex<()>,
}

impl ConnectionStore {
    pub fn new(options: StoreOptions) -> Arc<Self> {
        Arc::new(Self {
            options,
            entries: Mutex::new(HashMap::new()),
            // ponytail: one global spawn guard; per-key locks if spawn throughput ever matters.
            connect_guard: tokio::sync::Mutex::new(()),
        })
    }

    pub fn register(&self, spec: LaunchSpec, compat: AgentCompat) -> ConnectionKey {
        let key = ConnectionKey::new(spec.profile_id.clone(), spec.host.clone());
        let mut entries = self.lock_entries();
        entries.entry(key.clone()).or_insert_with(|| Entry {
            key: key.clone(),
            spec,
            compat,
            state: Lifecycle::Terminated,
            protocol: None,
            info: None,
            capabilities: None,
            pid: None,
            restarts: 0,
            spawn_count: 0,
            leases: 0,
            last_active: Instant::now(),
            child: None,
            connection: None,
        });
        key
    }

    pub async fn acquire(
        self: &Arc<Self>,
        key: &ConnectionKey,
    ) -> Result<ConnectionLease, StoreError> {
        let _guard = self.connect_guard.lock().await;

        if let Some(lease) = self.reuse(key) {
            return Ok(lease);
        }

        let pending = self.begin_spawn(key)?;
        drop(pending.connection);
        if let Some(mut child) = pending.child {
            let _ = child.force_kill_group().await;
        }

        let spawned = self
            .spawn_connection(key, &pending.spec, &pending.compat)
            .await?;
        Ok(self.install(key, spawned))
    }

    pub async fn reap_idle(&self) -> usize {
        let candidates: Vec<ConnectionKey> = {
            let entries = self.lock_entries();
            entries
                .values()
                .filter(|entry| {
                    entry.state == Lifecycle::Draining
                        && entry.leases == 0
                        && entry.last_active.elapsed() >= self.options.idle_grace
                })
                .map(|entry| entry.key.clone())
                .collect()
        };

        let mut reaped = 0;
        for key in candidates {
            let (child, connection) = {
                let mut entries = self.lock_entries();
                let Some(entry) = entries.get_mut(&key) else {
                    continue;
                };
                if entry.state != Lifecycle::Draining || entry.leases != 0 {
                    continue;
                }
                entry.state = Lifecycle::Terminated;
                (entry.child.take(), entry.connection.take())
            };
            drop(connection);
            if let Some(mut child) = child {
                if child
                    .cancel_ladder(self.options.cancel_grace)
                    .await
                    .is_err()
                {
                    let _ = child.force_kill_group().await;
                }
            }
            reaped += 1;
        }
        reaped
    }

    pub async fn restart(&self, key: &ConnectionKey) -> Result<(), StoreError> {
        let (child, connection) = {
            let mut entries = self.lock_entries();
            let entry = entries
                .get_mut(key)
                .ok_or_else(|| StoreError::UnknownProfile(key.profile_id.clone()))?;
            entry.state = Lifecycle::Error;
            (entry.child.take(), entry.connection.take())
        };
        drop(connection);
        if let Some(mut child) = child {
            child
                .force_kill_group()
                .await
                .map_err(|error| StoreError::Spawn(error.to_string()))?;
        }
        Ok(())
    }

    pub fn entries(&self) -> Vec<ConnectionEntry> {
        let mut entries = self.lock_entries();
        let mut rows: Vec<ConnectionEntry> = Vec::new();
        for entry in entries.values_mut() {
            refresh_liveness(entry);
            let Some(state) = entry.state.exposed() else {
                continue;
            };
            rows.push(ConnectionEntry {
                key: entry.key.clone(),
                state,
                protocol: entry.protocol,
                info: entry.info.clone(),
                capabilities: entry.capabilities.clone(),
                pid: entry.pid,
                restarts: entry.restarts,
                stale: entry.state == Lifecycle::Error,
            });
        }
        rows.sort_by(|a, b| {
            a.key
                .profile_id
                .cmp(&b.key.profile_id)
                .then_with(|| a.key.host.cmp(&b.key.host))
        });
        rows
    }

    pub fn spawns(&self, key: &ConnectionKey) -> u32 {
        self.lock_entries()
            .get(key)
            .map(|entry| entry.spawn_count)
            .unwrap_or(0)
    }

    pub fn entry(&self, key: &ConnectionKey) -> Option<ConnectionEntry> {
        let mut entries = self.lock_entries();
        let entry = entries.get_mut(key)?;
        refresh_liveness(entry);
        let state = entry.state.exposed().unwrap_or(ConnectionState::Connecting);
        Some(ConnectionEntry {
            key: entry.key.clone(),
            state,
            protocol: entry.protocol.or(entry.compat.preferred_protocol),
            info: entry.info.clone(),
            capabilities: entry.capabilities.clone(),
            pid: entry.pid,
            restarts: entry.restarts,
            stale: entry.state == Lifecycle::Error,
        })
    }

    pub fn set_capabilities_for_test(
        &self,
        key: &ConnectionKey,
        capabilities: Option<NormalizedCapabilities>,
    ) {
        let mut entries = self.lock_entries();
        if let Some(entry) = entries.get_mut(key) {
            entry.capabilities = capabilities;
            entry.state = Lifecycle::Connected;
            if entry.protocol.is_none() {
                entry.protocol = entry.compat.preferred_protocol;
            }
        }
    }

    pub(crate) fn live_connection(
        &self,
        key: &ConnectionKey,
    ) -> Result<Option<Arc<AcpConnection>>, StoreError> {
        let entries = self.lock_entries();
        let entry = entries
            .get(key)
            .ok_or_else(|| StoreError::UnknownProfile(key.profile_id.clone()))?;
        Ok(entry.connection.clone())
    }

    pub(crate) fn cancel_grace(&self) -> Duration {
        self.options.cancel_grace
    }

    fn reuse(self: &Arc<Self>, key: &ConnectionKey) -> Option<ConnectionLease> {
        let mut entries = self.lock_entries();
        let entry = entries.get_mut(key)?;
        refresh_liveness(entry);
        if entry.state != Lifecycle::Connected {
            return None;
        }
        let connection = entry.connection.clone()?;
        entry.leases += 1;
        entry.last_active = Instant::now();
        Some(ConnectionLease {
            store: Arc::clone(self),
            key: key.clone(),
            connection,
        })
    }

    fn begin_spawn(&self, key: &ConnectionKey) -> Result<PendingSpawn, StoreError> {
        let mut entries = self.lock_entries();
        let entry = entries
            .get_mut(key)
            .ok_or_else(|| StoreError::UnknownProfile(key.profile_id.clone()))?;
        entry.spawn_count += 1;
        if entry.spawn_count > 1 {
            entry.restarts += 1;
        }
        entry.state = Lifecycle::Connecting;
        Ok(PendingSpawn {
            spec: entry.spec.clone(),
            compat: entry.compat.clone(),
            child: entry.child.take(),
            connection: entry.connection.take(),
        })
    }

    async fn spawn_connection(
        &self,
        key: &ConnectionKey,
        spec: &LaunchSpec,
        compat: &AgentCompat,
    ) -> Result<Spawned, StoreError> {
        let mut command = tokio::process::Command::new(&spec.program);
        command.args(&spec.args);
        if let Some(cwd) = &spec.cwd {
            command.current_dir(cwd);
        }
        for (name, value) in &spec.env {
            command.env(name, value);
        }

        let mut child = match SupervisedChild::spawn(command, spec.stderr_capacity) {
            Ok(child) => child,
            Err(error) => {
                self.mark_error(key, None);
                return Err(StoreError::Spawn(error.to_string()));
            }
        };
        let pid = child.id();
        let stdin = child.take_stdin();
        let stdout = child.take_stdout();
        let (Some(stdin), Some(stdout)) = (stdin, stdout) else {
            let _ = child.force_kill_group().await;
            self.mark_error(key, Some(pid));
            return Err(StoreError::Spawn(
                "child stdio pipes unavailable".to_string(),
            ));
        };

        let options = AcpConnectOptions {
            protocol: compat.preferred_protocol.unwrap_or(self.options.protocol),
            client_name: self.options.client_name.clone(),
            permission_resolver: Arc::clone(&self.options.permission_resolver),
            elicitation_resolver: Arc::clone(&self.options.elicitation_resolver),
            elicitation: true,
        };
        let transport = ByteStreams::new(stdin.compat_write(), stdout.compat());
        match tethys_acp::connect(options, transport).await {
            Ok(connection) => Ok(Spawned {
                child,
                connection: Arc::new(connection),
                pid,
            }),
            Err(error) => {
                let _ = child.force_kill_group().await;
                self.mark_error(key, Some(pid));
                Err(StoreError::Connect(error.to_string()))
            }
        }
    }

    fn install(self: &Arc<Self>, key: &ConnectionKey, spawned: Spawned) -> ConnectionLease {
        let Spawned {
            child,
            connection,
            pid,
        } = spawned;
        let info = connection.info().clone();
        let capabilities = connection.capabilities().clone();
        let protocol = connection.protocol();

        {
            let mut entries = self.lock_entries();
            if let Some(entry) = entries.get_mut(key) {
                entry.state = Lifecycle::Connected;
                entry.child = Some(child);
                entry.connection = Some(Arc::clone(&connection));
                entry.pid = Some(pid);
                entry.protocol = Some(protocol);
                entry.info = Some(info);
                entry.capabilities = Some(capabilities);
                entry.leases += 1;
                entry.last_active = Instant::now();
            }
        }

        watch_connection(Arc::clone(self), key.clone(), Arc::downgrade(&connection));

        ConnectionLease {
            store: Arc::clone(self),
            key: key.clone(),
            connection,
        }
    }

    fn release(&self, key: &ConnectionKey) {
        let mut entries = self.lock_entries();
        if let Some(entry) = entries.get_mut(key) {
            entry.leases = entry.leases.saturating_sub(1);
            entry.last_active = Instant::now();
            if entry.leases == 0 && entry.state == Lifecycle::Connected {
                entry.state = Lifecycle::Draining;
            }
        }
    }

    fn mark_error(&self, key: &ConnectionKey, pid: Option<u32>) {
        let mut entries = self.lock_entries();
        if let Some(entry) = entries.get_mut(key) {
            entry.state = Lifecycle::Error;
            entry.connection = None;
            if pid.is_some() {
                entry.pid = pid;
            }
        }
    }

    fn lock_entries(&self) -> MutexGuard<'_, HashMap<ConnectionKey, Entry>> {
        self.entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn refresh_liveness(entry: &mut Entry) {
    if entry.state != Lifecycle::Connected {
        return;
    }
    let exited = entry
        .child
        .as_mut()
        .is_some_and(|child| matches!(child.try_wait(), Ok(Some(_))));
    if exited {
        entry.connection = None;
        entry.state = Lifecycle::Error;
    }
}

fn watch_connection(
    store: Arc<ConnectionStore>,
    key: ConnectionKey,
    connection: Weak<AcpConnection>,
) {
    tokio::spawn(async move {
        // `wait_closed` fires on an SDK error or on `AcpConnection` drop, so wait
        // in bounded slices and release the strong handle between them; a
        // permanent strong handle would keep the connection from ever dropping.
        loop {
            let Some(connection) = connection.upgrade() else {
                return;
            };
            let closed = tokio::time::timeout(Duration::from_millis(500), connection.wait_closed())
                .await
                .is_ok();
            if !closed {
                drop(connection);
                continue;
            }

            let mut entries = store.lock_entries();
            if let Some(entry) = entries.get_mut(&key) {
                let same = entry
                    .connection
                    .as_ref()
                    .is_some_and(|current| Arc::ptr_eq(current, &connection));
                if same && entry.state == Lifecycle::Connected {
                    entry.connection = None;
                    entry.state = Lifecycle::Error;
                }
            }
            return;
        }
    });
}

pub struct ConnectionLease {
    store: Arc<ConnectionStore>,
    key: ConnectionKey,
    connection: Arc<AcpConnection>,
}

impl ConnectionLease {
    pub fn connection(&self) -> &Arc<AcpConnection> {
        &self.connection
    }

    pub fn key(&self) -> &ConnectionKey {
        &self.key
    }
}

impl Drop for ConnectionLease {
    fn drop(&mut self) {
        self.store.release(&self.key);
    }
}
