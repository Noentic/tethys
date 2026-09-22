//! `thread.*` implementations.

use tethys_api::{ApiError, ThreadApi};
use tethys_schema::queue::QueuedPrompt;
use tethys_schema::thread::{
    ContentBlock, CreateThread, ThreadBootstrap, ThreadId, ThreadSessionView, ThreadSummary,
};

use crate::Core;

impl ThreadApi for Core {
    async fn thread_prepare(&self, request: CreateThread) -> Result<ThreadBootstrap, ApiError> {
        self.sessions.prepare(request).await
    }

    async fn thread_create(&self, request: CreateThread) -> Result<ThreadSummary, ApiError> {
        self.sessions.create(request).await
    }

    async fn thread_list(&self) -> Result<Vec<ThreadSummary>, ApiError> {
        Ok(self.sessions.list())
    }

    async fn thread_get(&self, id: ThreadId) -> Result<ThreadSessionView, ApiError> {
        self.sessions.get(&id).await
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
        let workspace_id = self.sessions.get(&id).await?.thread.workspace_id;
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

    async fn thread_list_provider_sessions(
        &self,
        profile_id: String,
        workspace_id: String,
        cursor: Option<String>,
    ) -> Result<tethys_schema::thread::ProviderSessionPage, ApiError> {
        self.sessions
            .list_provider_sessions(&profile_id, &workspace_id, cursor.as_deref())
            .await
    }

    async fn thread_import_sessions(
        &self,
        profile_id: String,
        workspace_id: String,
    ) -> Result<Vec<ThreadSummary>, ApiError> {
        self.sessions
            .import_sessions(&profile_id, &workspace_id)
            .await
    }

    async fn thread_respond_extension(
        &self,
        id: ThreadId,
        request_id: String,
        response_json: String,
    ) -> Result<(), ApiError> {
        self.sessions
            .respond_extension(&id, &request_id, &response_json)
            .await
    }

    async fn thread_delete_provider_session(&self, id: ThreadId) -> Result<(), ApiError> {
        self.sessions.delete_provider_session(&id).await
    }

    async fn thread_set_config_option(
        &self,
        id: ThreadId,
        option_id: String,
        value: String,
    ) -> Result<(), ApiError> {
        self.sessions
            .set_config_option(&id, &option_id, &value)
            .await
    }

    async fn thread_resume(&self, id: ThreadId) -> Result<(), ApiError> {
        self.sessions.resume(&id).await
    }

    async fn thread_archive(&self, id: ThreadId) -> Result<(), ApiError> {
        self.sessions.archive(&id).await
    }

    async fn thread_delete(&self, id: ThreadId) -> Result<(), ApiError> {
        self.sessions.delete(&id).await
    }

    async fn thread_set_permission_mode(
        &self,
        id: ThreadId,
        mode: tethys_schema::workspace::PermissionMode,
    ) -> Result<(), ApiError> {
        self.sessions.set_permission_mode(&id, mode)
    }
}
