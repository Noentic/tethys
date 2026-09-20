//! Thread sessions: connection leases, event fan-out, and the materialized
//! thread state (architecture §6.1, §12; M1.2 in-memory until M1.1 persists).

use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;

use futures::stream::{self, StreamExt};use parking_lot::{Mutex, RwLock};
use tethys_acp::AcpConnection;
use tethys_agent_servers::{ConnectionLease, ConnectionStore, LaunchSpec};
use tethys_schema::connection::{AcpProtocol, AgentCompat, ConnectionEntry, ConnectionKey};
use tethys_schema::sync::{McpTransports, WorkspaceId};
use tethys_schema::cancel::{CancelPhase, CancelState};
use tethys_schema::thread::{
    ContentBlock, CreateThread, EventEnvelope, ThreadId, ThreadSummary, ThreadView, TurnEventBody,
};
use tethys_sync::SecretStore;
use tethys_thread::{
    AgentConnection, EventOrigin, NewSession, ResumeSession, SessionId, ThreadMachine,
};
use tokio::sync::broadcast;
use tokio::task::JoinHandle;

use crate::health::HealthRegistry;
use crate::permission::pending::{Isolation, PermissionRegistry, ThreadPermissionContext};
use crate::workspace_roots::WorkspaceRoots;
use crate::ApiError;

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
    session: Option<SessionId>,
    lease: Option<ConnectionLease>,
    events: Vec<EventEnvelope>,
    next_seq: u32,
    cancel: CancelState,
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
            let spec = crate::agent_profile::spec_from_input(&row.id, &input);
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
        if !self.profiles.lock().contains_key(&request.agent_profile_id) {
            return Err(ApiError::NotFound(format!(
                "agent profile {}",
                request.agent_profile_id
            )));
        }
        let workspace_id = WorkspaceId::new(&request.workspace_id);
        let roots = self.roots.read().clone();
        let workspace_root = roots.root(&workspace_id).await?;
        let id = ThreadId::new(format!("thread-{}", self.threads.lock().len() + 1));
        let handle = Arc::new(ThreadHandle {
            inner: Mutex::new(ThreadInner {
                machine: ThreadMachine::new(id.clone()),
                workspace_id: request.workspace_id,
                agent_profile_id: request.agent_profile_id,
                workdir: PathBuf::from(request.workdir),
                workspace_root,
                session: None,
                lease: None,
                events: Vec::new(),
                next_seq: 0,
                cancel: CancelState {
                    thread_id: id.clone(),
                    phase: CancelPhase::Idle,
                },
            }),
            subscribers: broadcast::channel(1024).0,
            reader: Mutex::new(None),
            cancel_timer: Mutex::new(None),
        });
        let summary = handle.inner.lock().summary();
        self.threads.lock().insert(id, handle);
        Ok(summary)
    }

    pub fn thread_workspace_root(&self, id: &ThreadId) -> Result<PathBuf, ApiError> {
        let handle = self.handle(id)?;
        let root = handle.inner.lock().workspace_root.clone();
        Ok(root)
    }

    pub fn mcp_servers_for_thread(&self, id: &ThreadId) -> Result<Vec<serde_json::Value>, ApiError> {
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
            .map(|handle| handle.inner.lock().summary())
            .collect()
    }

    pub fn get(&self, id: &ThreadId) -> Result<ThreadView, ApiError> {
        let handle = self.handle(id)?;
        let inner = handle.inner.lock();
        Ok(ThreadView {
            thread: inner.summary(),
            entries: inner.machine.entries().to_vec(),
            latest_seq: inner.next_seq,
        })
    }

    pub async fn prompt(&self, id: &ThreadId, blocks: Vec<ContentBlock>) -> Result<(), ApiError> {
        let handle = self.handle(id)?;
        self.ensure_connection(&handle).await?;
        let (connection, session) = live_connection(&handle)?;
        let result = connection.prompt(&session, blocks).await;
        // The turn settled (acknowledged cancel, completion, or error): close
        // the cancel window so no `grace_elapsed` follows an answered turn.
        self.finish_cancel(id);
        result.map_err(|error| {
            self.mark_transport_lost(&handle);
            ApiError::Internal(error.to_string())
        })
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
                self.emit_cancel(&handle, CancelPhase::Terminating);
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
                );
                // Armed before the protocol cancel is sent: if that send fails the
                // window still closes into `grace_elapsed` (Force kill is offered)
                // rather than sticking in `cancel_requested`, and a fast settle
                // finds the timer to abort.
                arm_grace_timer(&handle, grace);
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
    fn emit_cancel(&self, handle: &Arc<ThreadHandle>, phase: CancelPhase) {
        let mut inner = handle.inner.lock();
        inner.cancel.phase = phase;
        let body = TurnEventBody::CancelPhaseChanged(inner.cancel.clone());
        let envelope = push_event(&mut inner, body);
        let _ = handle.subscribers.send(envelope);
    }

    /// Closes the cancel window once the turn settles (idempotent).
    fn finish_cancel(&self, id: &ThreadId) {
        let Ok(handle) = self.handle(id) else {
            return;
        };
        if let Some(task) = handle.cancel_timer.lock().take() {
            task.abort();
        }
        let mut inner = handle.inner.lock();
        if matches!(inner.cancel.phase, CancelPhase::Idle) {
            return;
        }
        inner.cancel.phase = CancelPhase::Idle;
        let body = TurnEventBody::CancelPhaseChanged(inner.cancel.clone());
        let envelope = push_event(&mut inner, body);
        let _ = handle.subscribers.send(envelope);
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

    pub fn archive(&self, id: &ThreadId) -> Result<(), ApiError> {
        let handle = self.handle(id)?;
        handle.inner.lock().machine.archive();
        Ok(())
    }

    pub fn delete(&self, id: &ThreadId) -> Result<(), ApiError> {
        self.permissions().cancel_thread(id);
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
                .filter(|event| event.seq >= since_seq)
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
        let (key, existing_session, workdir, workspace_root) = {
            let inner = handle.inner.lock();
            let key = self.profile_key(&inner.agent_profile_id)?;
            (
                key,
                inner.session.clone(),
                inner.workdir.clone(),
                inner.workspace_root.clone(),
            )
        };

        if let Ok((_, _)) = live_connection(handle) {
            return Ok(());
        }

        let lease = self
            .store
            .acquire(&key)
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;

        let mcp_servers = self.mcp_servers(&workspace_root, &key)?;

        let session = match existing_session {
            Some(session) => {
                lease
                    .connection()
                    .resume_session(ResumeSession {
                        session_id: session.clone(),
                        cwd: workdir,
                        additional_directories: vec![],
                        mcp_servers: mcp_servers.clone(),
                        replay: true,
                    })
                    .await
                    .map_err(|error| ApiError::Internal(error.to_string()))?;
                session
            }
            None => {
                lease
                    .connection()
                    .new_session(NewSession {
                        cwd: workdir,
                        additional_directories: vec![],
                        mcp_servers,
                    })
                    .await
                    .map_err(|error| ApiError::Internal(error.to_string()))?
                    .id
            }
        };

        let connection = lease.connection().clone();
        let existing_mode = self
            .permissions()
            .context(&session)
            .map(|context| context.mode);
        {
            let mut inner = handle.inner.lock();
            inner.session = Some(session.clone());
            inner.lease = Some(lease);
        }
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
        let task = tokio::spawn(async move {
            let mut events = connection.events(&session);
            loop {
                tokio::select! {
                    event = events.next() => {
                        let Some(Ok(event)) = event else { break };
                        let mut inner = task_handle.inner.lock();
                        let seq = inner.next_seq;
                        inner.next_seq += 1;
                        let origin = if event.replayed { EventOrigin::Replay } else { EventOrigin::Live };
                        inner.machine.apply(seq, &event.body, origin);
                        let envelope = EventEnvelope { thread_id: inner.machine.id().clone(), seq, event: event.body };
                        // ponytail: in-memory log; U6 swaps this for tethys-store once M1.1 lands.
                        inner.events.push(envelope.clone());
                        let _ = task_handle.subscribers.send(envelope);
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

    fn mark_transport_lost(&self, handle: &Arc<ThreadHandle>) {
        let thread_id = {
            let mut inner = handle.inner.lock();
            inner.lease = None;
            inner.machine.mark_interrupted();
            inner.machine.id().clone()
        };
        self.permissions().cancel_thread(&thread_id);
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
fn push_event(inner: &mut ThreadInner, body: TurnEventBody) -> EventEnvelope {
    let seq = inner.next_seq;
    inner.next_seq += 1;
    let envelope = EventEnvelope {
        thread_id: inner.machine.id().clone(),
        seq,
        event: body,
    };
    inner.events.push(envelope.clone());
    envelope
}

/// Moves the thread to `grace_elapsed` when the window closes unanswered.
fn arm_grace_timer(handle: &Arc<ThreadHandle>, grace: std::time::Duration) {
    let timer_handle = handle.clone();
    let task = tokio::spawn(async move {
        tokio::time::sleep(grace).await;
        let mut inner = timer_handle.inner.lock();
        if matches!(inner.cancel.phase, CancelPhase::CancelRequested { .. }) {
            inner.cancel.phase = CancelPhase::GraceElapsed;
            let body = TurnEventBody::CancelPhaseChanged(inner.cancel.clone());
            let envelope = push_event(&mut inner, body);
            let _ = timer_handle.subscribers.send(envelope);
        }
    });
    *handle.cancel_timer.lock() = Some(task);
}

/// RFC 3339 instant `grace` after now, for `CancelPhase::CancelRequested`.
fn rfc3339_after(grace: std::time::Duration) -> String {
    let deadline = time::OffsetDateTime::now_utc()
        + time::Duration::seconds_f64(grace.as_secs_f64().max(0.0));
    deadline
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default()
}
