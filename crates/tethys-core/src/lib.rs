//! Orchestrator and domain core (implements `tethys-api`).

pub mod synthetic;
pub mod thread_session;

use parking_lot::RwLock;
use std::sync::Arc;
use tethys_agent_servers::{ConnectionStore, StoreOptions};
use tethys_api::{ApiError, TethysApi};
use tethys_schema::connection::{AcpProtocol, ConnectionEntry};
use tethys_schema::thread::{ContentBlock, CreateThread, ThreadId, ThreadSummary, ThreadView};
use tethys_schema::{DiffHunk, HealthStatus, HostInfo, SearchItem};
use tethys_search::WorktreeSearchIndex;

use crate::thread_session::{DenyPermissionResolver, ThreadSessions};

pub struct Core {
    version: String,
    search_index: Arc<RwLock<Option<WorktreeSearchIndex>>>,
    sessions: Arc<ThreadSessions>,
}

impl Core {
    pub fn new(version: impl Into<String>) -> Self {
        let store = ConnectionStore::new(StoreOptions::new(
            AcpProtocol::V1,
            Arc::new(DenyPermissionResolver),
        ));
        Self::with_sessions(version, Arc::new(ThreadSessions::new(store)))
    }

    pub fn with_sessions(version: impl Into<String>, sessions: Arc<ThreadSessions>) -> Self {
        Self {
            version: version.into(),
            search_index: Arc::new(RwLock::new(None)),
            sessions,
        }
    }

    pub fn set_search_index(&self, index: WorktreeSearchIndex) {
        *self.search_index.write() = Some(index);
    }

    pub fn sessions(&self) -> &Arc<ThreadSessions> {
        &self.sessions
    }
}

impl TethysApi for Core {
    async fn host_info(&self) -> Result<HostInfo, ApiError> {
        Ok(HostInfo {
            version: self.version.clone(),
            platform: std::env::consts::OS.to_string(),
        })
    }

    async fn health(&self) -> Result<HealthStatus, ApiError> {
        Ok(HealthStatus {
            ok: true,
            core_version: self.version.clone(),
        })
    }

    async fn search_files(&self, query: String, limit: usize) -> Result<Vec<SearchItem>, ApiError> {
        let guard = self.search_index.read();
        let index = guard
            .as_ref()
            .ok_or_else(|| ApiError::Internal("Search index not initialized".to_string()))?;

        index.query(&query, limit).map_err(ApiError::Internal)
    }

    async fn thread_create(&self, request: CreateThread) -> Result<ThreadSummary, ApiError> {
        self.sessions.create(request)
    }

    async fn thread_list(&self) -> Result<Vec<ThreadSummary>, ApiError> {
        Ok(self.sessions.list())
    }

    async fn thread_get(&self, id: ThreadId) -> Result<ThreadView, ApiError> {
        self.sessions.get(&id)
    }

    async fn thread_prompt(&self, id: ThreadId, blocks: Vec<ContentBlock>) -> Result<(), ApiError> {
        self.sessions.prompt(&id, blocks).await
    }

    async fn thread_cancel(&self, id: ThreadId) -> Result<(), ApiError> {
        self.sessions.cancel(&id).await
    }

    async fn thread_resume(&self, id: ThreadId) -> Result<(), ApiError> {
        self.sessions.resume(&id).await
    }

    async fn thread_archive(&self, id: ThreadId) -> Result<(), ApiError> {
        self.sessions.archive(&id)
    }

    async fn thread_delete(&self, id: ThreadId) -> Result<(), ApiError> {
        self.sessions.delete(&id)
    }

    async fn events_subscribe(
        &self,
        thread_id: ThreadId,
        since_seq: u32,
    ) -> Result<tethys_api::EventStream, ApiError> {
        self.sessions.subscribe(&thread_id, since_seq)
    }

    async fn agent_connections_list(&self) -> Result<Vec<ConnectionEntry>, ApiError> {
        Ok(self.sessions.connections())
    }

    async fn agent_connections_restart(&self, profile_id: String) -> Result<(), ApiError> {
        self.sessions.restart_connection(&profile_id).await
    }

    async fn generate_synthetic_diff(&self, line_count: usize) -> Result<Vec<DiffHunk>, ApiError> {
        Ok(synthetic::generate_synthetic_diff(line_count))
    }
}
