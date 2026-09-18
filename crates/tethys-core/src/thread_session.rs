//! Thread sessions: connection leases, event fan-out, and the materialized
//! thread state (architecture §6.1, §12; M1.2 in-memory until M1.1 persists).

use std::collections::HashMap;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;

use async_trait::async_trait;
use futures::stream::{self, StreamExt};
use parking_lot::Mutex;
use tethys_acp::AcpConnection;
use tethys_agent_servers::{ConnectionLease, ConnectionStore, LaunchSpec};
use tethys_schema::connection::AgentCompat;
use tethys_schema::connection::{ConnectionEntry, ConnectionKey};
use tethys_schema::thread::{
    ContentBlock, CreateThread, EventEnvelope, ThreadId, ThreadSummary, ThreadView,
};
use tethys_thread::{
    AgentConnection, EventOrigin, NewSession, PermissionDecision, PermissionResolver,
    ResumeSession, SessionId, ThreadMachine,
};
use tokio::sync::broadcast;
use tokio::task::JoinHandle;

use crate::ApiError;

/// Safe default until the M1.8 policy engine: never approve without an answer.
pub struct DenyPermissionResolver;

#[async_trait]
impl PermissionResolver for DenyPermissionResolver {
    async fn resolve(
        &self,
        _request: tethys_schema::thread::PermissionRequested,
    ) -> PermissionDecision {
        PermissionDecision::cancelled()
    }
}

struct ThreadHandle {
    inner: Mutex<ThreadInner>,
    subscribers: broadcast::Sender<EventEnvelope>,
    reader: Mutex<Option<JoinHandle<()>>>,
}

struct ThreadInner {
    machine: ThreadMachine,
    project_id: String,
    agent_profile_id: String,
    workdir: PathBuf,
    session: Option<SessionId>,
    lease: Option<ConnectionLease>,
    events: Vec<EventEnvelope>,
    next_seq: u32,
}

impl ThreadInner {
    fn summary(&self) -> ThreadSummary {
        ThreadSummary {
            id: self.machine.id().clone(),
            project_id: self.project_id.clone(),
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
    profiles: Mutex<HashMap<String, (ConnectionKey, AgentCompat)>>,
    threads: Mutex<HashMap<ThreadId, Arc<ThreadHandle>>>,
}

impl ThreadSessions {
    pub fn new(store: Arc<ConnectionStore>) -> Self {
        Self {
            store,
            profiles: Mutex::new(HashMap::new()),
            threads: Mutex::new(HashMap::new()),
        }
    }

    pub fn store(&self) -> &Arc<ConnectionStore> {
        &self.store
    }

    /// Registers a launchable profile. M1.12 replaces this with the profile store.
    pub fn register_profile(&self, spec: LaunchSpec, compat: AgentCompat) -> String {
        let profile_id = spec.profile_id.clone();
        let key = self.store.register(spec, compat.clone());
        self.profiles
            .lock()
            .insert(profile_id.clone(), (key, compat));
        profile_id
    }

    pub fn create(&self, request: CreateThread) -> Result<ThreadSummary, ApiError> {
        if !self.profiles.lock().contains_key(&request.agent_profile_id) {
            return Err(ApiError::NotFound(format!(
                "agent profile {}",
                request.agent_profile_id
            )));
        }
        let id = ThreadId::new(format!("thread-{}", self.threads.lock().len() + 1));
        let handle = Arc::new(ThreadHandle {
            inner: Mutex::new(ThreadInner {
                machine: ThreadMachine::new(id.clone()),
                project_id: request.project_id,
                agent_profile_id: request.agent_profile_id,
                workdir: PathBuf::from(request.workdir),
                session: None,
                lease: None,
                events: Vec::new(),
                next_seq: 0,
            }),
            subscribers: broadcast::channel(1024).0,
            reader: Mutex::new(None),
        });
        let summary = handle.inner.lock().summary();
        self.threads.lock().insert(id, handle);
        Ok(summary)
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
        connection.prompt(&session, blocks).await.map_err(|error| {
            self.mark_transport_lost(&handle);
            ApiError::Internal(error.to_string())
        })
    }

    pub async fn cancel(&self, id: &ThreadId) -> Result<(), ApiError> {
        let handle = self.handle(id)?;
        let Ok((connection, session)) = live_connection(&handle) else {
            return Ok(());
        };
        connection
            .cancel(&session)
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))
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
        if let Some(handle) = self.threads.lock().remove(id) {
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

    /// Acquires a lease (spawning if needed) and ensures a live session plus
    /// its reader task. New sessions start fresh; replaced connections resume
    /// with replay (D12/D13).
    async fn ensure_connection(&self, handle: &Arc<ThreadHandle>) -> Result<(), ApiError> {
        let (key, existing_session, workdir) = {
            let inner = handle.inner.lock();
            let key = self.profile_key(&inner.agent_profile_id)?;
            (key, inner.session.clone(), inner.workdir.clone())
        };

        if let Ok((_, _)) = live_connection(handle) {
            return Ok(());
        }

        let lease = self
            .store
            .acquire(&key)
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;

        let session = match existing_session {
            Some(session) => {
                lease
                    .connection()
                    .resume_session(ResumeSession {
                        session_id: session.clone(),
                        cwd: workdir,
                        additional_directories: vec![],
                        mcp_servers: vec![],
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
                        mcp_servers: vec![],
                    })
                    .await
                    .map_err(|error| ApiError::Internal(error.to_string()))?
                    .id
            }
        };

        let connection = lease.connection().clone();
        {
            let mut inner = handle.inner.lock();
            inner.session = Some(session.clone());
            inner.lease = Some(lease);
        }
        self.start_reader(handle, connection, session);
        Ok(())
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
            if matches!(
                inner.machine.state(),
                tethys_schema::thread::ThreadState::Running
                    | tethys_schema::thread::ThreadState::AwaitingApproval
            ) {
                inner.machine.mark_interrupted();
            }
            inner.lease = None;
            *task_handle.reader.lock() = None;
        });
        *handle.reader.lock() = Some(task);
    }

    fn mark_transport_lost(&self, handle: &Arc<ThreadHandle>) {
        let mut inner = handle.inner.lock();
        inner.lease = None;
        inner.machine.mark_interrupted();
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
