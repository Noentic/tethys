//! `thread.*` implementations.

use tethys_api::{ApiError, ThreadApi};
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

    async fn thread_set_permission_mode(
        &self,
        id: ThreadId,
        mode: tethys_schema::workspace::PermissionMode,
    ) -> Result<(), ApiError> {
        self.sessions.set_permission_mode(&id, mode)
    }
}
