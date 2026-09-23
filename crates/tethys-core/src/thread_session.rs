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
    ConfigOption, ContentBlock, CreateThread, EventEnvelope, MessageUpsert, Patch, Role,
    ThreadBootstrap, ThreadId, ThreadSessionView, ThreadSummary, TurnEventBody,
};
use tethys_store::{EventStore, ThreadRecord};
use tethys_sync::SecretStore;
use tethys_thread::{
    AgentConnection, ConnectionError, EventOrigin, NewSession, ResumeSession, SessionId,
    ThreadMachine,
};
use tokio::sync::broadcast;
use tokio::sync::Mutex as AsyncMutex;
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

impl ThreadSessions {
    pub fn new(
        store: Arc<ConnectionStore>,
        sync: SyncSource,
        roots: Arc<dyn WorkspaceRoots>,
    ) -> Self {
        let health = HealthRegistry::new(Arc::clone(&store));
        Self {
            store,
            sync,
            roots: RwLock::new(roots),
            profiles: Mutex::new(HashMap::new()),
            disabled: Mutex::new(HashSet::new()),
            threads: Mutex::new(HashMap::new()),
            next_thread_id: AtomicU64::new(1),
            event_store: RwLock::new(None),
            permissions: RwLock::new(PermissionRegistry::new()),
            health,
        }
    }

    pub fn with_default_roots(store: Arc<ConnectionStore>, sync: SyncSource) -> Self {
        Self::new(
            store,
            sync,
            Arc::new(crate::workspace_roots::StaticWorkspaces::new()),
        )
    }

    /// Attaches the existing durable event log used by a persistent Core.
    pub fn set_event_store(&self, store: Arc<EventStore>) {
        *self.event_store.write() = Some(store);
    }

    /// Restores committed threads and removes unprompted drafts left by a crash.
    pub async fn hydrate_threads(&self) -> Result<(), ApiError> {
        let event_store = self.event_store.read().clone();
        let Some(store) = event_store else {
            return Ok(());
        };
        let records = store
            .list_threads()
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;
        for record in records {
            if record.prepared {
                store
                    .delete_thread(&record.summary.id)
                    .await
                    .map_err(|error| ApiError::Internal(error.to_string()))?;
                continue;
            }
            if let Some(number) = record
                .summary
                .id
                .as_str()
                .strip_prefix("thread-")
                .and_then(|suffix| suffix.parse::<u64>().ok())
            {
                self.next_thread_id
                    .fetch_max(number.saturating_add(1), Ordering::Relaxed);
            }
            let workspace_id = WorkspaceId::new(&record.summary.workspace_id);
            let workspace_root = self.roots.read().clone().root(&workspace_id).await?;
            let event_count = store
                .count_events(&record.summary.id)
                .await
                .map_err(|error| ApiError::Internal(error.to_string()))?;
            let stored_events = store
                .read_events(
                    &record.summary.id,
                    0,
                    u32::try_from(event_count).unwrap_or(u32::MAX),
                )
                .await
                .map_err(|error| ApiError::Internal(error.to_string()))?;
            let mut machine = ThreadMachine::new(record.summary.id.clone());
            machine.set_title(record.summary.title.clone());
            if let Some(session_id) = &record.summary.session_id {
                machine.set_session(SessionId(session_id.clone()));
            }
            let mut events = Vec::new();
            for stored in stored_events {
                if stored.event_type != THREAD_EVENT {
                    continue;
                }
                let Ok(mut body) = serde_json::from_str::<TurnEventBody>(&stored.payload) else {
                    continue;
                };
                if let TurnEventBody::ProviderExtension(extension) = &mut body {
                    // ACP responders are process-local; after restart these rows
                    // remain inspectable but cannot be answered.
                    extension.request_id = None;
                }
                let seq = u32::try_from(stored.seq).unwrap_or(u32::MAX);
                machine.apply(seq, &body, EventOrigin::Live);
                events.push(EventEnvelope {
                    thread_id: record.summary.id.clone(),
                    seq,
                    event: body,
                });
            }
            match record.summary.state {
                tethys_schema::thread::ThreadState::Archived => machine.archive(),
                tethys_schema::thread::ThreadState::Interrupted => machine.mark_interrupted(),
                _ if matches!(
                    machine.state(),
                    tethys_schema::thread::ThreadState::Running
                        | tethys_schema::thread::ThreadState::AwaitingApproval
                ) =>
                {
                    machine.mark_interrupted()
                }
                _ => {}
            }
            let next_seq = u32::try_from(record.latest_seq.saturating_add(1)).unwrap_or(u32::MAX);
            let id = record.summary.id.clone();
            let handle = ThreadHandle::new(ThreadInner {
                machine,
                workspace_id: record.summary.workspace_id,
                agent_profile_id: record.summary.agent_profile_id,
                workdir: PathBuf::from(record.workdir),
                workspace_root,
                additional_directories: record
                    .additional_directories
                    .iter()
                    .map(PathBuf::from)
                    .collect(),
                session: record.summary.session_id.map(SessionId),
                config_options: record.config_options,
                capabilities: record.capabilities,
                prepared: false,
                lease: None,
                events,
                next_seq,
                cancel: CancelState {
                    thread_id: id.clone(),
                    phase: CancelPhase::Idle,
                },
                prompt_in_flight: false,
                pending_extensions: HashSet::new(),
            });
            self.threads.lock().insert(id, handle);
        }
        Ok(())
    }

    pub fn set_roots(&self, roots: Arc<dyn WorkspaceRoots>) {
        *self.roots.write() = roots;
    }

    /// Shares the policy registry the injected resolver reads (M1.7 U3).
    pub fn set_permissions(&self, registry: Arc<PermissionRegistry>) {
        *self.permissions.write() = registry;
    }

    pub fn permissions(&self) -> Arc<PermissionRegistry> {
        self.permissions.read().clone()
    }

    /// Answers a surfaced permission request (`permission.respond`).
    pub fn respond_permission(
        &self,
        thread_id: &ThreadId,
        req_id: &str,
        option_id: Option<String>,
    ) -> Result<(), ApiError> {
        self.permissions()
            .complete_permission(thread_id, req_id, option_id)
    }

    /// Answers a surfaced elicitation (`elicitation_respond`).
    pub fn respond_elicitation(
        &self,
        thread_id: &ThreadId,
        response: tethys_schema::elicitation::ElicitationResponse,
    ) -> Result<(), ApiError> {
        self.permissions().complete_elicitation(thread_id, response)
    }

    /// Sets a thread's permission mode (`thread.set_permission_mode`).
    pub fn set_permission_mode(
        &self,
        thread_id: &ThreadId,
        mode: tethys_schema::workspace::PermissionMode,
    ) -> Result<(), ApiError> {
        self.permissions().set_mode(thread_id, mode)
    }

    pub fn store(&self) -> &Arc<ConnectionStore> {
        &self.store
    }

    async fn persist_thread(&self, handle: &Arc<ThreadHandle>) -> Result<(), ApiError> {
        let event_store = self.event_store.read().clone();
        persist_thread_state(event_store, handle).await
    }

    pub fn sync(&self) -> &SyncSource {
        &self.sync
    }

    /// Registers a launchable profile. M1.12 replaces this with the profile store.
    pub fn register_profile(&self, spec: LaunchSpec, compat: AgentCompat) -> String {
        let profile_id = spec.profile_id.clone();
        let key = self.store.register(spec, compat.clone());
        self.profiles
            .lock()
            .insert(profile_id.clone(), (key, compat));
        self.refresh_health_enabled();
        profile_id
    }

    /// Removes a profile from the hot cache (`agent.profiles_delete`).
    pub fn unregister_profile(&self, profile_id: &str) -> bool {
        let removed = self.profiles.lock().remove(profile_id).is_some();
        self.refresh_health_enabled();
        removed
    }

    /// The health registry shared with the `agent.*` namespace.
    pub fn health(&self) -> &Arc<HealthRegistry> {
        &self.health
    }

    /// The store key for a registered profile, if any.
    pub fn connection_key(&self, profile_id: &str) -> Option<ConnectionKey> {
        self.profiles
            .lock()
            .get(profile_id)
            .map(|(key, _)| key.clone())
    }

    /// Hydrates the in-memory profile cache from persisted rows at `Core::open`.
    pub fn hydrate_profiles(&self, rows: &[tethys_store::AgentProfileRow]) {
        for row in rows {
            let Ok(input) = crate::agent_profile::input_from_row(row) else {
                continue;
            };
            let integration_id = crate::agent_profile::registry_ref_from_row(row)
                .ok()
                .flatten()
                .map(|reference| reference.id);
            let spec =
                crate::agent_profile::spec_from_input(&row.id, &input, integration_id.as_deref());
            let compat = crate::agent_profile::compat_from_row(row);
            self.register_profile(spec, compat);
            self.set_profile_enabled(&row.id, row.enabled);
        }
    }

    /// Records whether the user has this profile switched on. A disabled
    /// profile stays registered but is never spawned by a health sweep.
    pub fn set_profile_enabled(&self, profile_id: &str, enabled: bool) {
        {
            let mut disabled = self.disabled.lock();
            if enabled {
                disabled.remove(profile_id);
            } else {
                disabled.insert(profile_id.to_string());
            }
        }
        self.refresh_health_enabled();
    }

    fn refresh_health_enabled(&self) {
        let disabled = self.disabled.lock();
        let keys = self
            .profiles
            .lock()
            .iter()
            .filter(|(id, _)| !disabled.contains(*id))
            .map(|(_, (key, _))| key.clone())
            .collect();
        self.health.set_enabled(keys);
    }

    pub fn profiles_compat(&self) -> Vec<(String, ConnectionKey, AgentCompat)> {
        let guard = self.profiles.lock();
        let mut list: Vec<_> = guard
            .iter()
            .map(|(id, (key, compat))| (id.clone(), key.clone(), compat.clone()))
            .collect();
        list.sort_by(|a, b| a.0.cmp(&b.0));
        list
    }

    pub async fn create(&self, request: CreateThread) -> Result<ThreadSummary, ApiError> {
        self.create_with_visibility(request, false, None).await
    }

    /// Reserves the id the next prepared thread takes, so a worktree can be
    /// registered under it before the session starts (`prepare_as`).
    pub fn reserve_thread_id(&self) -> ThreadId {
        ThreadId::new(format!(
            "thread-{}",
            self.next_thread_id.fetch_add(1, Ordering::Relaxed)
        ))
    }

    async fn create_with_visibility(
        &self,
        request: CreateThread,
        prepared: bool,
        reserved: Option<ThreadId>,
    ) -> Result<ThreadSummary, ApiError> {
        if !self.profiles.lock().contains_key(&request.agent_profile_id) {
            return Err(ApiError::NotFound(format!(
                "agent profile {}",
                request.agent_profile_id
            )));
        }
        let workspace_id = WorkspaceId::new(&request.workspace_id);
        let roots = self.roots.read().clone();
        let workspace_root = roots.root(&workspace_id).await?;
        let mut additional_directories = Vec::new();
        for root_id in &request.additional_directories {
            if root_id == &request.workspace_id {
                return Err(ApiError::InvalidConfig(
                    "additional directory repeats the workspace root".into(),
                ));
            }
            let path = roots.root(&WorkspaceId::new(root_id)).await?;
            let canonical = tokio::fs::canonicalize(&path).await.map_err(|error| {
                ApiError::NotFound(format!("additional directory {}: {error}", path.display()))
            })?;
            if !additional_directories.contains(&canonical) {
                additional_directories.push(canonical);
            }
        }
        // The one `thread.create` call site consults `max_concurrent_sessions`
        // (architecture §10.6): a non-git folder admits one session, so a second
        // window or a direct API caller cannot bypass the cap. The check runs a
        // read-only git read, so it stays off the async worker.
        let root_for_check = workspace_root.clone();
        let limit = tokio::task::spawn_blocking(move || {
            crate::workspace::capability::max_concurrent_sessions_for_root(&root_for_check)
        })
        .await
        .map_err(|error| ApiError::Internal(format!("concurrency check failed: {error}")))?;
        if let Some(limit) = limit {
            let live = self
                .threads
                .lock()
                .values()
                .filter(|handle| {
                    let inner = handle.inner.lock();
                    inner.workspace_id == request.workspace_id
                        && !matches!(
                            inner.machine.state(),
                            tethys_schema::thread::ThreadState::Archived
                        )
                })
                .count() as u32;
            if live >= limit {
                return Err(ApiError::ConcurrencyLimit {
                    workspace_id: request.workspace_id,
                    limit,
                });
            }
        }
        let id = reserved.unwrap_or_else(|| self.reserve_thread_id());
        let handle = ThreadHandle::new(ThreadInner {
            machine: ThreadMachine::new(id.clone()),
            workspace_id: request.workspace_id,
            agent_profile_id: request.agent_profile_id,
            workdir: PathBuf::from(request.workdir),
            workspace_root,
            additional_directories,
            session: None,
            config_options: Vec::new(),
            capabilities: None,
            prepared,
            lease: None,
            events: Vec::new(),
            next_seq: 1,
            cancel: CancelState {
                thread_id: id.clone(),
                phase: CancelPhase::Idle,
            },
            prompt_in_flight: false,
            pending_extensions: HashSet::new(),
        });
        let summary = handle.inner.lock().summary();
        self.persist_thread(&handle).await?;
        self.threads.lock().insert(id, handle);
        Ok(summary)
    }

    /// One page of Provider sessions under the trusted root (`thread.list_provider_sessions`).
    pub async fn list_provider_sessions(
        &self,
        profile_id: &str,
        workspace_id: &str,
        cursor: Option<&str>,
    ) -> Result<tethys_schema::thread::ProviderSessionPage, ApiError> {
        let key = self.profile_key(profile_id)?;
        let roots = self.roots.read().clone();
        let workspace_root = roots.root(&WorkspaceId::new(workspace_id)).await?;
        let lease = self
            .store
            .acquire(&key)
            .await
            .map_err(|error| map_store_error(&self.health, profile_id, error))?;
        let connection = lease.connection().clone();
        let (listed, next_cursor) = connection
            .list_sessions_page(&workspace_root, cursor)
            .await
            .map_err(|error| map_connection_error(&self.health, profile_id, error))?;
        drop(lease);

        let canonical_root = workspace_root.clone();
        let sessions = tokio::task::spawn_blocking(move || {
            let canonical_root = std::fs::canonicalize(canonical_root)
                .map_err(|error| ApiError::Internal(error.to_string()))?;
            Ok::<_, ApiError>(
                listed
                    .into_iter()
                    .filter_map(|session| {
                        if !session.cwd.is_absolute() {
                            return None;
                        }
                        let cwd = std::fs::canonicalize(&session.cwd).ok()?;
                        cwd.starts_with(&canonical_root).then_some(
                            tethys_schema::thread::ProviderSessionSummary {
                                id: session.id.0,
                                title: session.title,
                                cwd: cwd.display().to_string(),
                                updated_at: session.updated_at,
                            },
                        )
                    })
                    .collect::<Vec<_>>(),
            )
        })
        .await
        .map_err(|error| ApiError::Internal(format!("session list check failed: {error}")))??;

        Ok(tethys_schema::thread::ProviderSessionPage {
            sessions,
            next_cursor,
        })
    }

    /// Connects and creates the ACP session before returning composer controls.
    pub async fn prepare(&self, request: CreateThread) -> Result<ThreadBootstrap, ApiError> {
        self.prepare_as(request, None).await
    }

    /// `prepare` under an id from `reserve_thread_id`.
    pub async fn prepare_as(
        &self,
        request: CreateThread,
        reserved: Option<ThreadId>,
    ) -> Result<ThreadBootstrap, ApiError> {
        let summary = self.create_with_visibility(request, true, reserved).await?;
        let handle = self.handle(&summary.id)?;
        if let Err(error) = self.ensure_connection(&handle).await {
            let _ = self.delete(&summary.id).await;
            return Err(error);
        }
        let (thread, events, config_options, capabilities, session, latest_seq) = {
            let inner = handle.inner.lock();
            (
                inner.summary(),
                inner.events.clone(),
                inner.config_options.clone(),
                inner.capabilities.clone(),
                inner.session.clone(),
                inner.next_seq.saturating_sub(1),
            )
        };
        let permission_mode = session
            .as_ref()
            .and_then(|session| self.permissions().context(session))
            .map(|context| context.mode)
            .unwrap_or(tethys_schema::workspace::PermissionMode::Supervised);
        Ok(ThreadBootstrap {
            thread,
            events,
            config_options,
            capabilities,
            permission_mode,
            latest_seq,
        })
    }

    /// Imports Provider sessions whose working directories remain inside the
    /// selected trusted workspace. The ACP adapter consumes all list cursors.
    pub async fn import_sessions(
        &self,
        profile_id: &str,
        workspace_id: &str,
    ) -> Result<Vec<ThreadSummary>, ApiError> {
        let key = self.profile_key(profile_id)?;
        let roots = self.roots.read().clone();
        let workspace_root = roots.root(&WorkspaceId::new(workspace_id)).await?;
        let lease = self
            .store
            .acquire(&key)
            .await
            .map_err(|error| map_store_error(&self.health, profile_id, error))?;
        let connection = lease.connection().clone();
        let listed = connection
            .list_sessions(&workspace_root)
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;
        let canonical_root = workspace_root.clone();
        let (workspace_root, listed) = tokio::task::spawn_blocking(move || {
            let workspace_root = std::fs::canonicalize(canonical_root)
                .map_err(|error| ApiError::Internal(error.to_string()))?;
            let sessions = listed
                .into_iter()
                .filter_map(|session| {
                    if !session.cwd.is_absolute() {
                        return None;
                    }
                    let cwd = std::fs::canonicalize(&session.cwd).ok()?;
                    cwd.starts_with(&workspace_root).then_some((session, cwd))
                })
                .collect::<Vec<_>>();
            Ok::<_, ApiError>((workspace_root, sessions))
        })
        .await
        .map_err(|error| ApiError::Internal(format!("session import check failed: {error}")))??;
        let capabilities = connection.capabilities().clone();
        drop(lease);

        let mut imported = Vec::new();
        for (session, cwd) in listed {
            let existing = self.threads.lock().values().find_map(|handle| {
                let inner = handle.inner.lock();
                (inner.agent_profile_id == profile_id
                    && inner.workspace_id == workspace_id
                    && inner.session.as_ref() == Some(&session.id))
                .then(|| inner.summary())
            });
            if let Some(existing) = existing {
                imported.push(existing);
                continue;
            }

            let id = ThreadId::new(format!(
                "thread-{}",
                self.next_thread_id.fetch_add(1, Ordering::Relaxed)
            ));
            let mut machine = ThreadMachine::new(id.clone());
            machine.set_session(session.id.clone());
            if let Some(title) = &session.title {
                machine.set_title(title.clone());
            }
            let handle = ThreadHandle::new(ThreadInner {
                machine,
                workspace_id: workspace_id.to_string(),
                agent_profile_id: profile_id.to_string(),
                workdir: cwd,
                workspace_root: workspace_root.clone(),
                additional_directories: Vec::new(),
                session: Some(session.id),
                config_options: Vec::new(),
                capabilities: Some(capabilities.clone()),
                prepared: false,
                lease: None,
                events: Vec::new(),
                next_seq: 1,
                cancel: CancelState {
                    thread_id: id.clone(),
                    phase: CancelPhase::Idle,
                },
                prompt_in_flight: false,
                pending_extensions: HashSet::new(),
            });
            let summary = handle.inner.lock().summary();
            self.persist_thread(&handle).await?;
            self.threads.lock().insert(id, handle);
            imported.push(summary);
        }
        Ok(imported)
    }

    pub fn thread_workspace_root(&self, id: &ThreadId) -> Result<PathBuf, ApiError> {
        let handle = self.handle(id)?;
        let root = handle.inner.lock().workspace_root.clone();
        Ok(root)
    }

    pub fn mcp_servers_for_thread(
        &self,
        id: &ThreadId,
    ) -> Result<Vec<serde_json::Value>, ApiError> {
        let handle = self.handle(id)?;
        let (key, workspace_root) = {
            let inner = handle.inner.lock();
            let key = self.profile_key(&inner.agent_profile_id)?;
            (key, inner.workspace_root.clone())
        };
        self.mcp_servers(&workspace_root, &key)
    }

    pub fn list(&self) -> Vec<ThreadSummary> {
        self.threads
            .lock()
            .values()
            .filter_map(|handle| {
                let inner = handle.inner.lock();
                (!inner.prepared).then(|| inner.summary())
            })
            .collect()
    }

    pub async fn get(&self, id: &ThreadId) -> Result<ThreadSessionView, ApiError> {
        let handle = self.handle(id)?;
        let (state, profile_id) = {
            let inner = handle.inner.lock();
            (inner.machine.state(), inner.agent_profile_id.clone())
        };
        // A persisted transcript remains readable before profiles are restored
        // (for example during a cold open or when a provider was removed).
        // Reconnect when the profile is available, but do not make hydration
        // depend on a live child process.
        if state != tethys_schema::thread::ThreadState::Archived
            && self.profile_key(&profile_id).is_ok()
        {
            self.ensure_connection(&handle).await?;
        }
        let (thread, entries, events, config_options, capabilities, session, latest_seq) = {
            let inner = handle.inner.lock();
            (
                inner.summary(),
                inner.machine.entries().to_vec(),
                inner.events.clone(),
                inner.config_options.clone(),
                inner.capabilities.clone(),
                inner.session.clone(),
                inner.next_seq.saturating_sub(1),
            )
        };
        let permission_mode = session
            .as_ref()
            .and_then(|session| self.permissions().context(session))
            .map(|context| context.mode)
            .unwrap_or(tethys_schema::workspace::PermissionMode::Supervised);
        Ok(ThreadSessionView {
            thread,
            entries,
            events,
            config_options,
            capabilities,
            permission_mode,
            latest_seq,
        })
    }

    pub async fn prompt(&self, id: &ThreadId, blocks: Vec<ContentBlock>) -> Result<(), ApiError> {
        let handle = self.handle(id)?;
        if handle.inner.lock().machine.state() == tethys_schema::thread::ThreadState::Archived {
            return Err(ApiError::Conflict(
                "archived thread must be resumed before prompting".into(),
            ));
        }
        self.ensure_connection(&handle).await?;
        let (connection, session) = live_connection(&handle)?;
        {
            let mut inner = handle.inner.lock();
            if inner.prompt_in_flight {
                return Err(ApiError::Conflict("a prompt is already in flight".into()));
            }
            inner.prompt_in_flight = true;
            inner.prepared = false;
        }
        let user_message_id = {
            let inner = handle.inner.lock();
            format!("{}:user:{}", inner.machine.id(), inner.next_seq)
        };
        let event_store = self.event_store.read().clone();
        if let Err(error) = append_event(
            &handle,
            event_store.clone(),
            TurnEventBody::MessageUpsert(MessageUpsert {
                message_id: user_message_id,
                role: Role::User,
                content: Patch::Set(blocks.clone()),
            }),
            EventOrigin::Live,
        )
        .await
        {
            let mut inner = handle.inner.lock();
            inner.prompt_in_flight = false;
            inner.prepared = true;
            return Err(error);
        }
        if let Err(error) = self.persist_thread(&handle).await {
            let mut inner = handle.inner.lock();
            inner.prompt_in_flight = false;
            inner.prepared = true;
            return Err(error);
        }
        let task_handle = handle.clone();
        let permissions = self.permissions();
        let health = self.health.clone();
        let profile_id = handle.inner.lock().agent_profile_id.clone();
        let thread_store = event_store.clone();
        tokio::spawn(async move {
            let result = connection.prompt(&session, blocks).await;
            if let Some(timer) = task_handle.cancel_timer.lock().take() {
                timer.abort();
            }
            if let Err(error) = result {
                let auth_required = matches!(error, ConnectionError::AuthRequired);
                if auth_required {
                    health.mark_auth_required(&profile_id);
                }
                let thread_id = {
                    let mut inner = task_handle.inner.lock();
                    inner.prompt_in_flight = false;
                    inner.lease = None;
                    inner.machine.id().clone()
                };
                let _ = append_event(
                    &task_handle,
                    event_store.clone(),
                    TurnEventBody::Error {
                        code: if auth_required {
                            "auth_required".into()
                        } else {
                            "prompt_failed".into()
                        },
                        message: error.to_string(),
                        retryable: true,
                    },
                    EventOrigin::Live,
                )
                .await;
                task_handle.inner.lock().machine.mark_interrupted();
                let _ = persist_thread_state(thread_store, &task_handle).await;
                if let Some(reader) = task_handle.reader.lock().take() {
                    reader.abort();
                }
                permissions.cancel_thread(&thread_id);
            }
            let cancel_state = {
                let mut inner = task_handle.inner.lock();
                inner.prompt_in_flight = false;
                if matches!(inner.cancel.phase, CancelPhase::Idle) {
                    None
                } else {
                    inner.cancel.phase = CancelPhase::Idle;
                    Some(inner.cancel.clone())
                }
            };
            if let Some(cancel_state) = cancel_state {
                let _ = append_event(
                    &task_handle,
                    event_store,
                    TurnEventBody::CancelPhaseChanged(cancel_state),
                    EventOrigin::Live,
                )
                .await;
            }
        });
        Ok(())
    }

    pub async fn set_config_option(
        &self,
        id: &ThreadId,
        option_id: &str,
        value: &str,
    ) -> Result<(), ApiError> {
        let handle = self.handle(id)?;
        let (is_mode, boolean) = {
            let inner = handle.inner.lock();
            let option = inner
                .config_options
                .iter()
                .find(|option| option.id == option_id)
                .ok_or_else(|| {
                    ApiError::InvalidConfig(format!("unknown config option {option_id}"))
                })?;
            (
                option.category.as_deref() == Some("mode"),
                option.kind == Some(tethys_schema::thread::ConfigOptionKind::Boolean),
            )
        };
        if is_mode {
            let known = {
                let inner = handle.inner.lock();
                inner
                    .config_options
                    .iter()
                    .find(|option| option.id == option_id)
                    .map(|option| option.values.clone())
                    .unwrap_or_default()
            };
            if !known.is_empty() && !known.iter().any(|known| known == value) {
                return Err(ApiError::InvalidConfig(format!("unknown mode {value}")));
            }
        }
        let (connection, session) = live_connection(&handle)?;
        let options = if is_mode {
            connection
                .set_mode(&session, value)
                .await
                .map_err(|error| ApiError::Internal(error.to_string()))?;
            let mut inner = handle.inner.lock();
            if let Some(option) = inner
                .config_options
                .iter_mut()
                .find(|option| option.id == option_id)
            {
                option.current_value = value.to_string();
            }
            inner.config_options.clone()
        } else {
            let value = if boolean {
                serde_json::Value::Bool(value.parse().map_err(|_| {
                    ApiError::InvalidConfig(format!("{option_id} expects true or false"))
                })?)
            } else {
                serde_json::Value::String(value.to_string())
            };
            let options = connection
                .set_config_option(&session, option_id, value)
                .await
                .map_err(|error| ApiError::Internal(error.to_string()))?;
            let mut inner = handle.inner.lock();
            merge_config_options(&mut inner.config_options, &options);
            inner.config_options.clone()
        };
        self.persist_thread(&handle).await?;
        let event_store = self.event_store.read().clone();
        append_event(
            &handle,
            event_store,
            TurnEventBody::ConfigOptionsChanged { options },
            EventOrigin::Live,
        )
        .await?;
        Ok(())
    }

    /// Requests cancellation and advances the M1.6c phase contract (spec §4).
    ///
    /// The backend owns the clock: the first press emits `cancel_requested`
    /// with an absolute grace deadline and sends the protocol cancel; the grace
    /// timer moves to `grace_elapsed` when the window closes. A press while
    /// `grace_elapsed` requests the destructive rung explicitly and emits
    /// `terminating` — a second press during `cancel_requested` does nothing
    /// ("a second click does not advance the ladder").
    pub async fn cancel(&self, id: &ThreadId) -> Result<(), ApiError> {
        let handle = self.handle(id)?;
        self.permissions().cancel_thread(id);

        let phase = handle.inner.lock().cancel.phase.clone();
        match phase {
            CancelPhase::GraceElapsed => {
                let key = self.profile_key(&handle.inner.lock().agent_profile_id)?;
                self.emit_cancel(&handle, CancelPhase::Terminating).await;
                self.store
                    .force_kill(&key)
                    .await
                    .map_err(|error| ApiError::Internal(error.to_string()))?;
                Ok(())
            }
            CancelPhase::CancelRequested { .. } | CancelPhase::Terminating => Ok(()),
            CancelPhase::Idle => {
                // Nothing to cancel when no turn is in flight; do not open a
                // window that can only expire.
                if !matches!(
                    handle.inner.lock().machine.state(),
                    tethys_schema::thread::ThreadState::Running
                        | tethys_schema::thread::ThreadState::AwaitingApproval
                ) {
                    return Ok(());
                }
                let Ok((connection, session)) = live_connection(&handle) else {
                    return Ok(());
                };
                let grace = self.store.cancel_grace();
                let deadline = rfc3339_after(grace);
                self.emit_cancel(
                    &handle,
                    CancelPhase::CancelRequested {
                        grace_deadline: deadline,
                    },
                )
                .await;
                // Armed before the protocol cancel is sent: if that send fails the
                // window still closes into `grace_elapsed` (Force kill is offered)
                // rather than sticking in `cancel_requested`, and a fast settle
                // finds the timer to abort.
                let event_store = self.event_store.read().clone();
                arm_grace_timer(&handle, grace, event_store);
                connection
                    .cancel(&session)
                    .await
                    .map_err(|error| ApiError::Internal(error.to_string()))?;
                Ok(())
            }
        }
    }

    /// The last known cancel phase for a thread (`thread.cancel_state`), so a
    /// subscriber that opens mid-cancel does not wait for the next event.
    pub fn cancel_state(&self, id: &ThreadId) -> Result<CancelState, ApiError> {
        let handle = self.handle(id)?;
        let phase = handle.inner.lock().cancel.clone();
        Ok(phase)
    }

    /// Emits a cancel phase on the same ordered stream as turn events.
    async fn emit_cancel(&self, handle: &Arc<ThreadHandle>, phase: CancelPhase) {
        let state = {
            let mut inner = handle.inner.lock();
            inner.cancel.phase = phase;
            inner.cancel.clone()
        };
        let event_store = self.event_store.read().clone();
        let _ = append_event(
            handle,
            event_store,
            TurnEventBody::CancelPhaseChanged(state),
            EventOrigin::Live,
        )
        .await;
    }

    /// Reconnects an interrupted thread: acquires a fresh lease and resumes the
    /// agent session with replay (recovery rung 3).
    pub async fn resume(&self, id: &ThreadId) -> Result<(), ApiError> {
        let handle = self.handle(id)?;
        {
            let mut inner = handle.inner.lock();
            inner.lease = None;
            inner.machine.mark_resumed();
        }
        self.ensure_connection(&handle).await
    }

    pub async fn archive(&self, id: &ThreadId) -> Result<(), ApiError> {
        let handle = self.handle(id)?;
        if let Ok((connection, session)) = live_connection(&handle) {
            if connection.capabilities().close_session {
                connection
                    .close_session(&session)
                    .await
                    .map_err(|error| ApiError::Internal(error.to_string()))?;
            } else {
                connection
                    .cancel(&session)
                    .await
                    .map_err(|error| ApiError::Internal(error.to_string()))?;
            }
        }
        let lease = {
            let mut inner = handle.inner.lock();
            inner.machine.archive();
            inner.session = None;
            inner.pending_extensions.clear();
            inner.lease.take()
        };
        drop(lease);
        self.persist_thread(&handle).await?;
        Ok(())
    }

    pub async fn respond_extension(
        &self,
        id: &ThreadId,
        request_id: &str,
        response_json: &str,
    ) -> Result<(), ApiError> {
        let response: serde_json::Value = serde_json::from_str(response_json).map_err(|error| {
            ApiError::InvalidConfig(format!("invalid extension response: {error}"))
        })?;
        let handle = self.handle(id)?;
        if !handle.inner.lock().pending_extensions.contains(request_id) {
            return Err(ApiError::NotFound(format!(
                "extension request {request_id}"
            )));
        }
        let (connection, session) = live_connection(&handle)?;
        connection
            .respond_extension(&session, request_id, response)
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;
        let event_store = self.event_store.read().clone();
        append_event(
            &handle,
            event_store,
            TurnEventBody::ProviderExtensionResolved {
                request_id: request_id.to_string(),
                cancelled: false,
            },
            EventOrigin::Live,
        )
        .await?;
        Ok(())
    }

    pub async fn delete_provider_session(&self, id: &ThreadId) -> Result<(), ApiError> {
        let handle = self.handle(id)?;
        let (key, session) = {
            let inner = handle.inner.lock();
            let session = inner
                .session
                .clone()
                .ok_or_else(|| ApiError::NotFound("Provider session".into()))?;
            (self.profile_key(&inner.agent_profile_id)?, session)
        };
        let lease = self.store.acquire(&key).await.map_err(|error| {
            let profile_id = handle.inner.lock().agent_profile_id.clone();
            map_store_error(&self.health, &profile_id, error)
        })?;
        let connection = lease.connection().clone();
        let deleter = connection.session_deleter().ok_or_else(|| {
            ApiError::InvalidConfig("provider does not support session deletion".into())
        })?;
        deleter
            .delete_session(&session)
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;
        let thread_lease = {
            let mut inner = handle.inner.lock();
            inner.machine.archive();
            inner.session = None;
            inner.pending_extensions.clear();
            inner.lease.take()
        };
        drop(thread_lease);
        drop(lease);
        self.persist_thread(&handle).await
    }

    pub async fn delete(&self, id: &ThreadId) -> Result<(), ApiError> {
        self.permissions().cancel_thread(id);
        self.archive(id).await?;
        let event_store = self.event_store.read().clone();
        if let Some(store) = event_store {
            store
                .delete_thread(id)
                .await
                .map_err(|error| ApiError::Internal(error.to_string()))?;
        }
        if let Some(handle) = self.threads.lock().remove(id) {
            let session = handle.inner.lock().session.clone();
            if let Some(session) = session {
                self.permissions().unregister_session(&session);
            }
            if let Some(reader) = handle.reader.lock().take() {
                reader.abort();
            }
        }
        Ok(())
    }

    pub fn connections(&self) -> Vec<ConnectionEntry> {
        self.store.entries()
    }

    pub async fn restart_connection(&self, profile_id: &str) -> Result<(), ApiError> {
        let key = self.profile_key(profile_id)?;
        self.store
            .restart(&key)
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))
    }

    /// Events from `since_seq` (inclusive) followed by live events.
    pub fn subscribe(
        &self,
        id: &ThreadId,
        since_seq: u32,
    ) -> Result<tethys_api::EventStream, ApiError> {
        let handle = self.handle(id)?;
        let (receiver, backlog) = {
            let inner = handle.inner.lock();
            let receiver = handle.subscribers.subscribe();
            let backlog: Vec<EventEnvelope> = inner
                .events
                .iter()
                .filter(|event| event.seq > since_seq)
                .cloned()
                .collect();
            (receiver, backlog)
        };
        let live = stream::unfold(receiver, |mut receiver| async move {
            loop {
                match receiver.recv().await {
                    Ok(event) => return Some((event, receiver)),
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => return None,
                }
            }
        });
        let stream: Pin<Box<dyn futures::Stream<Item = EventEnvelope> + Send>> =
            Box::pin(stream::iter(backlog).chain(live));
        Ok(stream)
    }

    fn handle(&self, id: &ThreadId) -> Result<Arc<ThreadHandle>, ApiError> {
        self.threads
            .lock()
            .get(id)
            .cloned()
            .ok_or_else(|| ApiError::NotFound(format!("thread {id}")))
    }

    fn profile_key(&self, profile_id: &str) -> Result<ConnectionKey, ApiError> {
        self.profiles
            .lock()
            .get(profile_id)
            .map(|(key, _)| key.clone())
            .ok_or_else(|| ApiError::NotFound(format!("agent profile {profile_id}")))
    }

    /// Builds the resolved MCP server set for one spawn.
    ///
    /// Secrets are resolved here, at spawn time, and never written to disk,
    /// logs, or events.
    fn mcp_servers(
        &self,
        workspace_root: &Path,
        key: &ConnectionKey,
    ) -> Result<Vec<serde_json::Value>, ApiError> {
        let transports = self.transports_for(key)?;
        let resolved = tethys_sync::session::spawn_servers_for_provider(
            &self.sync.home,
            workspace_root,
            Some(key.profile_id.as_str()),
            &self.sync.disabled,
            &transports,
            self.sync.secrets.as_ref(),
        )
        .map_err(|error| ApiError::Internal(error.to_string()))?;
        resolved
            .into_iter()
            .map(|server| {
                serde_json::to_value(server).map_err(|error| ApiError::Internal(error.to_string()))
            })
            .collect()
    }

    pub fn transports_for(&self, key: &ConnectionKey) -> Result<McpTransports, ApiError> {
        let entry = self
            .store
            .entry(key)
            .ok_or_else(|| ApiError::NotFound(format!("connection for {}", key.profile_id)))?;

        let capabilities = entry
            .capabilities
            .ok_or(ApiError::CapabilitiesNotNegotiated)?;

        let mut transports = capabilities.mcp;
        if entry.protocol == Some(AcpProtocol::V1) {
            transports.stdio = true;
        }
        Ok(transports)
    }

    /// Acquires a lease (spawning if needed) and ensures a live session plus
    /// its reader task. New sessions start fresh; replaced connections resume
    /// with replay (D12/D13).
    async fn ensure_connection(&self, handle: &Arc<ThreadHandle>) -> Result<(), ApiError> {
        let _connect_guard = handle.connect_guard.lock().await;
        let (key, existing_session, workdir, workspace_root, additional_directories) = {
            let inner = handle.inner.lock();
            let key = self.profile_key(&inner.agent_profile_id)?;
            (
                key,
                inner.session.clone(),
                inner.workdir.clone(),
                inner.workspace_root.clone(),
                inner.additional_directories.clone(),
            )
        };

        if let Ok((_, _)) = live_connection(handle) {
            return Ok(());
        }

        let lease = self.store.acquire(&key).await.map_err(|error| {
            let profile_id = handle.inner.lock().agent_profile_id.clone();
            map_store_error(&self.health, &profile_id, error)
        })?;

        let mcp_servers = self.mcp_servers(&workspace_root, &key)?;

        let session_handle = match existing_session {
            Some(session) => {
                let connection = lease.connection();
                if connection.capabilities().resume {
                    connection
                        .resume_session(ResumeSession {
                            session_id: session,
                            cwd: workdir.clone(),
                            additional_directories: additional_directories.clone(),
                            mcp_servers: mcp_servers.clone(),
                            replay: true,
                        })
                        .await
                        .map_err(|error| {
                            let profile_id = handle.inner.lock().agent_profile_id.clone();
                            map_connection_error(&self.health, &profile_id, error)
                        })?
                } else if connection.capabilities().load_session {
                    connection
                        .load_session(ResumeSession {
                            session_id: session,
                            cwd: workdir.clone(),
                            additional_directories: additional_directories.clone(),
                            mcp_servers: mcp_servers.clone(),
                            replay: true,
                        })
                        .await
                        .map_err(|error| {
                            let profile_id = handle.inner.lock().agent_profile_id.clone();
                            map_connection_error(&self.health, &profile_id, error)
                        })?
                } else {
                    // Neither lifecycle call exists: keep the cached transcript
                    // read-only and start a fresh session with a visible notice.
                    let fresh = connection
                        .new_session(NewSession {
                            cwd: workdir,
                            additional_directories,
                            mcp_servers,
                        })
                        .await
                        .map_err(|error| {
                            let profile_id = handle.inner.lock().agent_profile_id.clone();
                            map_connection_error(&self.health, &profile_id, error)
                        })?;
                    let event_store = self.event_store.read().clone();
                    let _ = append_event(
                        handle,
                        event_store,
                        TurnEventBody::Error {
                            code: "provider_cannot_resume".into(),
                            message:
                                "this provider cannot load or resume sessions; a fresh session was started"
                                    .into(),
                            retryable: false,
                        },
                        EventOrigin::Live,
                    )
                    .await;
                    fresh
                }
            }
            None => lease
                .connection()
                .new_session(NewSession {
                    cwd: workdir,
                    additional_directories,
                    mcp_servers,
                })
                .await
                .map_err(|error| {
                    let profile_id = handle.inner.lock().agent_profile_id.clone();
                    map_connection_error(&self.health, &profile_id, error)
                })?,
        };

        let session = session_handle.id.clone();
        let connection = lease.connection().clone();
        let capabilities = self.store.entry(&key).and_then(|entry| entry.capabilities);
        let existing_mode = self
            .permissions()
            .context(&session)
            .map(|context| context.mode);
        {
            let mut inner = handle.inner.lock();
            inner.session = Some(session.clone());
            inner.config_options = session_handle.config_options;
            inner.capabilities = capabilities;
            inner.lease = Some(lease);
        }
        self.persist_thread(handle).await?;
        self.register_permission_context(handle, &session, existing_mode);
        self.start_reader(handle, connection, session);
        Ok(())
    }

    /// Publishes the thread's workspace, isolation and mode to the policy
    /// registry so the injected resolver can decide requests for this session.
    fn register_permission_context(
        &self,
        handle: &Arc<ThreadHandle>,
        session: &SessionId,
        existing_mode: Option<tethys_schema::workspace::PermissionMode>,
    ) {
        let (thread_id, workspace_id, workdir, workspace_root) = {
            let inner = handle.inner.lock();
            (
                inner.machine.id().clone(),
                inner.workspace_id.clone(),
                inner.workdir.clone(),
                inner.workspace_root.clone(),
            )
        };
        // A worktree is a linked checkout whose `.git` is a file. A subdirectory
        // of the main checkout (or a caller-supplied path) is not one, so it
        // stays `MainCheckout` and YOLO is refused (SEC-02).
        let is_worktree = workdir != workspace_root && workdir.join(".git").is_file();
        let isolation = if is_worktree {
            Isolation::Worktree
        } else {
            Isolation::MainCheckout
        };
        let is_git = workspace_root.join(".git").exists();
        self.permissions().register_session(
            session,
            ThreadPermissionContext {
                thread_id,
                workspace_id,
                workspace_root,
                workdir,
                isolation,
                is_git,
                mode: existing_mode.unwrap_or(tethys_schema::workspace::PermissionMode::Supervised),
                yolo_opt_in: false,
            },
        );
    }

    fn start_reader(
        &self,
        handle: &Arc<ThreadHandle>,
        connection: Arc<AcpConnection>,
        session: SessionId,
    ) {
        if handle.reader.lock().is_some() {
            return;
        }
        let task_handle = handle.clone();
        let permissions = self.permissions();
        let event_store = self.event_store.read().clone();
        let task = tokio::spawn(async move {
            let mut events = connection.events(&session);
            loop {
                tokio::select! {
                    event = events.next() => {
                        let Some(Ok(event)) = event else { break };
                        let origin = if event.replayed { EventOrigin::Replay } else { EventOrigin::Live };
                        if let TurnEventBody::ConfigOptionsChanged { options } = &event.body {
                            let mut inner = task_handle.inner.lock();
                            merge_config_options(&mut inner.config_options, options);
                        }
                        if append_event(&task_handle, event_store.clone(), event.body, origin).await.is_err() {
                            break;
                        }
                    }
                    _ = connection.wait_closed() => break,
                }
            }
            let mut inner = task_handle.inner.lock();
            let thread_id = inner.machine.id().clone();
            if matches!(
                inner.machine.state(),
                tethys_schema::thread::ThreadState::Running
                    | tethys_schema::thread::ThreadState::AwaitingApproval
            ) {
                inner.machine.mark_interrupted();
            }
            inner.lease = None;
            drop(inner);
            // Answer anything parked when the transport died, so no resolver is
            // left awaiting a decision that can never arrive (SEC-07).
            permissions.cancel_thread(&thread_id);
            *task_handle.reader.lock() = None;
        });
        *handle.reader.lock() = Some(task);
    }
}

/// Merges an update into the cached option list.
///
/// Config-option responses containing `model` are complete schemas. A model
/// switch can remove dependent options such as Claude's `effort`; retaining
/// those stale entries makes the next UI selection fail at the provider.
/// Mode notifications are partial updates, so they keep the existing schema.
fn merge_config_options(current: &mut Vec<ConfigOption>, incoming: &[ConfigOption]) {
    let complete_schema = incoming
        .iter()
        .any(|option| option.id == "model" || option.category.as_deref() == Some("model"));
    if complete_schema {
        current.retain(|existing| incoming.iter().any(|option| option.id == existing.id));
    }

    for option in incoming {
        match current.iter_mut().find(|existing| existing.id == option.id) {
            Some(existing) => {
                existing.current_value = option.current_value.clone();
                if !option.name.is_empty() {
                    existing.name = option.name.clone();
                }
                if option.description.is_some() {
                    existing.description = option.description.clone();
                }
                if !option.values.is_empty() {
                    existing.values = option.values.clone();
                }
                if !option.value_options.is_empty() {
                    existing.value_options = option.value_options.clone();
                }
                if option.category.is_some() {
                    existing.category = option.category.clone();
                }
                if option.kind.is_some() {
                    existing.kind = option.kind.clone();
                }
            }
            None => current.push(option.clone()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn option(id: &str, category: Option<&str>) -> ConfigOption {
        ConfigOption {
            id: id.to_string(),
            name: id.to_string(),
            description: None,
            current_value: String::new(),
            values: Vec::new(),
            category: category.map(str::to_string),
            kind: None,
            value_options: Vec::new(),
            recommended_value: None,
            metadata: None,
        }
    }

    #[test]
    fn complete_model_schema_drops_stale_dependent_options() {
        let mut current = vec![
            option("mode", Some("mode")),
            option("model", Some("model")),
            option("effort", Some("thought_level")),
        ];
        let incoming = vec![option("mode", Some("mode")), option("model", Some("model"))];

        merge_config_options(&mut current, &incoming);

        assert_eq!(
            current
                .iter()
                .map(|option| option.id.as_str())
                .collect::<Vec<_>>(),
            vec!["mode", "model"]
        );
    }
}

fn live_connection(
    handle: &Arc<ThreadHandle>,
) -> Result<(Arc<AcpConnection>, SessionId), ApiError> {
    let inner = handle.inner.lock();
    match (&inner.lease, &inner.session) {
        (Some(lease), Some(session)) => Ok((lease.connection().clone(), session.clone())),
        _ => Err(ApiError::Internal("thread has no live connection".into())),
    }
}

/// Appends an event to the thread's in-memory log and returns its envelope.
async fn append_event(
    handle: &Arc<ThreadHandle>,
    event_store: Option<Arc<EventStore>>,
    body: TurnEventBody,
    origin: EventOrigin,
) -> Result<EventEnvelope, ApiError> {
    let _writer = handle.event_writer.lock().await;
    let (thread_id, local_seq) = {
        let inner = handle.inner.lock();
        (inner.machine.id().clone(), inner.next_seq)
    };
    let seq = if let Some(store) = event_store {
        let payload =
            serde_json::to_string(&body).map_err(|error| ApiError::Internal(error.to_string()))?;
        let range = store
            .append_batch(
                &thread_id,
                &[NewEvent {
                    kind: THREAD_EVENT.into(),
                    payload,
                    entry: None,
                }],
            )
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;
        u32::try_from(range.last)
            .map_err(|error| ApiError::Internal(format!("thread sequence overflow: {error}")))?
    } else {
        local_seq
    };
    let envelope = {
        let mut inner = handle.inner.lock();
        inner.next_seq = seq.saturating_add(1);
        match &body {
            TurnEventBody::ProviderExtension(extension) => {
                if let Some(request_id) = &extension.request_id {
                    inner.pending_extensions.insert(request_id.clone());
                }
            }
            TurnEventBody::ProviderExtensionResolved { request_id, .. } => {
                inner.pending_extensions.remove(request_id);
            }
            _ => {}
        }
        inner.machine.apply(seq, &body, origin);
        let envelope = EventEnvelope {
            thread_id,
            seq,
            event: body,
        };
        inner.events.push(envelope.clone());
        envelope
    };
    let _ = handle.subscribers.send(envelope.clone());
    Ok(envelope)
}

async fn persist_thread_state(
    event_store: Option<Arc<EventStore>>,
    handle: &Arc<ThreadHandle>,
) -> Result<(), ApiError> {
    let Some(store) = event_store else {
        return Ok(());
    };
    let (record, workspace_root) = {
        let inner = handle.inner.lock();
        (
            ThreadRecord {
                summary: inner.summary(),
                workdir: inner.workdir.display().to_string(),
                additional_directories: inner
                    .additional_directories
                    .iter()
                    .map(|path| path.display().to_string())
                    .collect(),
                config_options: inner.config_options.clone(),
                capabilities: inner.capabilities.clone(),
                prepared: inner.prepared,
                latest_seq: inner.next_seq.saturating_sub(1) as u64,
            },
            inner.workspace_root.display().to_string(),
        )
    };
    store
        .ensure_workspace(&record.summary.workspace_id, &workspace_root, "main")
        .await
        .map_err(|error| ApiError::Internal(error.to_string()))?;
    store
        .save_thread(record)
        .await
        .map_err(|error| ApiError::Internal(error.to_string()))
}

/// Moves the thread to `grace_elapsed` when the window closes unanswered.
fn arm_grace_timer(
    handle: &Arc<ThreadHandle>,
    grace: std::time::Duration,
    event_store: Option<Arc<EventStore>>,
) {
    let timer_handle = handle.clone();
    let task = tokio::spawn(async move {
        tokio::time::sleep(grace).await;
        let state = {
            let mut inner = timer_handle.inner.lock();
            if !matches!(inner.cancel.phase, CancelPhase::CancelRequested { .. }) {
                return;
            }
            inner.cancel.phase = CancelPhase::GraceElapsed;
            inner.cancel.clone()
        };
        let _ = append_event(
            &timer_handle,
            event_store,
            TurnEventBody::CancelPhaseChanged(state),
            EventOrigin::Live,
        )
        .await;
    });
    *handle.cancel_timer.lock() = Some(task);
}

/// RFC 3339 instant `grace` after now, for `CancelPhase::CancelRequested`.
fn rfc3339_after(grace: std::time::Duration) -> String {
    let deadline =
        time::OffsetDateTime::now_utc() + time::Duration::seconds_f64(grace.as_secs_f64().max(0.0));
    deadline
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default()
}
