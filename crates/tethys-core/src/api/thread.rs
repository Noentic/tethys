//! `thread.*` implementations.

use tethys_api::{ApiError, ThreadApi};
use tethys_schema::queue::QueuedPrompt;
use tethys_schema::thread::{ContentBlock, CreateThread, ThreadId, ThreadSummary, ThreadView};

use crate::Core;

impl ThreadApi for Core {
    async fn thread_create(&self, request: CreateThread) -> Result<ThreadSummary, ApiError> {
        self.sessions.create(request).await
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

    async fn thread_queue_list(&self, id: ThreadId) -> Result<Vec<QueuedPrompt>, ApiError> {
        let store = self.sync_store()?;
        crate::thread_queue::list(store, &id).await
    }

    async fn thread_queue_add(
        &self,
        id: ThreadId,
        blocks: Vec<ContentBlock>,
    ) -> Result<QueuedPrompt, ApiError> {
        let workspace_id = self.sessions.get(&id)?.thread.workspace_id;
        let root = self
            .workspace_roots()
            .root(&tethys_schema::sync::WorkspaceId::new(&workspace_id))
            .await?;
        let store = self.sync_store()?;
        crate::thread_queue::add(store, &id, &workspace_id, &root.to_string_lossy(), blocks).await
    }

    async fn thread_queue_remove(&self, id: ThreadId, queued_id: String) -> Result<(), ApiError> {
        let store = self.sync_store()?;
        crate::thread_queue::remove(store, &id, &queued_id).await
    }

    async fn thread_queue_reorder(
        &self,
        id: ThreadId,
        ordered_ids: Vec<String>,
    ) -> Result<(), ApiError> {
        let store = self.sync_store()?;
        crate::thread_queue::reorder(store, &id, ordered_ids).await
    }

    async fn thread_cancel(&self, id: ThreadId) -> Result<(), ApiError> {
        self.sessions.cancel(&id).await
    }

    async fn thread_cancel_state(
        &self,
        id: ThreadId,
    ) -> Result<tethys_schema::cancel::CancelState, ApiError> {
        self.sessions.cancel_state(&id)
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

    async fn thread_set_permission_mode(
        &self,
        id: ThreadId,
        mode: tethys_schema::workspace::PermissionMode,
    ) -> Result<(), ApiError> {
        self.sessions.set_permission_mode(&id, mode)
    }
}
