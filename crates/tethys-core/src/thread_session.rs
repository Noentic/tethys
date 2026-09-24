//! Thread sessions: connection leases, event fan-out, and the materialized
//! thread state (architecture §6.1, §12; M1.2 in-memory until M1.1 persists).

use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use futures::stream::{self, StreamExt};
use parking_lot::{Mutex, RwLock};
use tethys_acp::AcpConnection;
use tethys_agent_servers::{ConnectionLease, ConnectionStore, LaunchSpec};
use tethys_schema::cancel::{CancelPhase, CancelState};
use tethys_schema::connection::{
    AcpProtocol, AgentCompat, ConnectionEntry, ConnectionKey, NormalizedCapabilities,
};
use tethys_schema::store::NewEvent;
use tethys_schema::sync::{McpTransports, WorkspaceId};
use tethys_schema::thread::{
    ConfigOption, ContentBlock, CreateThread, Entry, EventEnvelope, MessageUpsert, Patch, Role,
    ThreadBootstrap, ThreadId, ThreadSessionView, ThreadSummary, TurnEventBody,
};
use tethys_store::{EventStore, ThreadRecord};
use tethys_sync::SecretStore;
use tethys_thread::{
    AgentConnection, ConnectionError, EventOrigin, NewSession, ResumeSession, SessionId,
    ThreadMachine,
};
use tokio::sync::Mutex as AsyncMutex;
use tokio::sync::{broadcast, oneshot};
use tokio::task::JoinHandle;

use crate::health::HealthRegistry;
use crate::permission::pending::{Isolation, PermissionRegistry, ThreadPermissionContext};
use crate::provider_error::{map_connection as map_connection_error, map_store as map_store_error};
use crate::workspace_roots::WorkspaceRoots;
use crate::ApiError;

const THREAD_EVENT: &str = "thread.event";

/// Everything the spawn path needs to build a session's MCP server set.
pub struct SyncSource {
    pub home: PathBuf,
    pub secrets: Arc<dyn SecretStore>,
    pub disabled: BTreeSet<String>,
}

impl SyncSource {
    pub fn new(home: impl Into<PathBuf>, secrets: Arc<dyn SecretStore>) -> Self {
        Self {
            home: home.into(),
            secrets,
            disabled: BTreeSet::new(),
        }
    }
}

struct ThreadHandle {
    inner: Mutex<ThreadInner>,
    connect_guard: AsyncMutex<()>,
    event_writer: AsyncMutex<()>,
    subscribers: broadcast::Sender<EventEnvelope>,
    reader: Mutex<Option<JoinHandle<()>>>,
    /// Grace-window timer for `cancel`; aborted when the turn settles.
    cancel_timer: Mutex<Option<JoinHandle<()>>>,
}

struct ThreadInner {
    machine: ThreadMachine,
    workspace_id: String,
    agent_profile_id: String,
    workdir: PathBuf,
    workspace_root: PathBuf,
    /// Canonical additional trusted roots for ACP `additionalDirectories`.
    additional_directories: Vec<PathBuf>,
    session: Option<SessionId>,
    config_options: Vec<ConfigOption>,
    capabilities: Option<NormalizedCapabilities>,
    prepared: bool,
    lease: Option<ConnectionLease>,
    events: Vec<EventEnvelope>,
    next_seq: u32,
    cancel: CancelState,
    prompt_in_flight: bool,
    pending_extensions: HashSet<String>,
}

impl ThreadHandle {
    fn new(inner: ThreadInner) -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(inner),
            connect_guard: AsyncMutex::new(()),
            event_writer: AsyncMutex::new(()),
            subscribers: broadcast::channel(1024).0,
            reader: Mutex::new(None),
            cancel_timer: Mutex::new(None),
        })
    }
}

impl ThreadInner {
    fn summary(&self) -> ThreadSummary {
        ThreadSummary {
            id: self.machine.id().clone(),
            workspace_id: self.workspace_id.clone(),
            agent_profile_id: self.agent_profile_id.clone(),
            title: self.machine.title().unwrap_or("Untitled").to_string(),
            workdir: self.workdir.display().to_string(),
            state: self.machine.state(),
            session_id: self.session.as_ref().map(|session| session.0.clone()),
        }
    }
}

/// Owns the store, per-thread machines, and event subscriptions.
pub struct ThreadSessions {
    store: Arc<ConnectionStore>,
    sync: SyncSource,
    roots: RwLock<Arc<dyn WorkspaceRoots>>,
    profiles: Mutex<HashMap<String, (ConnectionKey, AgentCompat)>>,
    /// Profiles the user switched off; the health sweep skips them.
    disabled: Mutex<HashSet<String>>,
    threads: Mutex<HashMap<ThreadId, Arc<ThreadHandle>>>,
    next_thread_id: AtomicU64,
    event_store: RwLock<Option<Arc<EventStore>>>,
    permissions: RwLock<Arc<PermissionRegistry>>,
    health: Arc<HealthRegistry>,
}

mod fork;
mod lifecycle;
mod persistence;
mod profiles;
mod turn;

#[cfg(test)]
mod tests;
