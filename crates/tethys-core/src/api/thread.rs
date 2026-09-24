//! `thread.*` implementations.

use tethys_api::{ApiError, GitApi, ThreadApi};
use tethys_schema::queue::QueuedPrompt;
use tethys_schema::thread::{
    ContentBlock, CreateThread, ThreadBootstrap, ThreadId, ThreadIsolation, ThreadSessionView,
    ThreadSummary,
};
use tethys_schema::{sync::WorkspaceId, CheckpointPhase, WorktreeSpec};

use crate::Core;

impl ThreadApi for Core {
    async fn thread_prepare(&self, mut request: CreateThread) -> Result<ThreadBootstrap, ApiError> {
        if let Some(ThreadIsolation::Worktree { base, branch }) = request.isolation.as_ref() {
            let id = self.sessions.reserve_thread_id();
            let info = self
                .git_worktree_create(WorktreeSpec {
                    thread_id: id.to_string(),
                    workspace_id: WorkspaceId::new(&request.workspace_id),
                    slug: id.to_string(),
                    path: String::new(),
                    branch: branch.clone().unwrap_or_default(),
                    base: base.clone(),
                    bootstrap_globs: Vec::new(),
                    setup_script: None,
                    main_checkout: false,
                })
                .await?;
            request.workdir = info.path;
            return match self.sessions.prepare_as(request, Some(id.clone())).await {
                Ok(bootstrap) => Ok(bootstrap),
                Err(error) => {
                    let _ = self.git_worktree_remove(id.to_string(), false, false).await;
                    Err(error)
                }
            };
        }

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
        let checkpoint = self.open_turn_checkpoint(&id).await;
        let settled = self.sessions.prompt(&id, blocks).await?;
        if let Some((engine, thread, turn)) = checkpoint {
            tokio::spawn(async move {
                if settled.await.is_err() {
                    return;
                }
                let result = tokio::task::spawn_blocking(move || {
                    engine.checkpoint_create(&thread, turn, CheckpointPhase::End)
                })
                .await;
                if let Ok(Err(error)) = result {
                    tracing::warn!(turn, %error, "turn end checkpoint failed");
                }
            });
        }
        Ok(())
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

    async fn thread_provider_control(
        &self,
        id: ThreadId,
        control: tethys_schema::thread::ProviderControl,
    ) -> Result<tethys_schema::thread::ProviderControlResult, ApiError> {
        self.sessions.provider_control(&id, control).await
    }

    async fn thread_fork(&self, id: ThreadId) -> Result<ThreadBootstrap, ApiError> {
        self.sessions.fork(&id).await
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
        self.sessions.delete(&id).await?;
        let _ = self.git_worktree_remove(id.to_string(), false, false).await;
        Ok(())
    }

    async fn thread_set_permission_mode(
        &self,
        id: ThreadId,
        mode: tethys_schema::workspace::PermissionMode,
    ) -> Result<(), ApiError> {
        self.sessions.set_permission_mode(&id, mode)
    }
}
