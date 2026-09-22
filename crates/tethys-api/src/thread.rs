//! `thread.*` namespace (`architecture.md` §12.1).

use tethys_schema::cancel::CancelState;
use tethys_schema::queue::QueuedPrompt;
use tethys_schema::thread::{
    ContentBlock, CreateThread, ProviderSessionPage, ThreadBootstrap, ThreadId, ThreadSessionView,
    ThreadSummary,
};

use crate::ApiError;

/// Thread lifecycle, prompting, queue and config methods.
pub trait ThreadApi: Send + Sync {
    fn thread_prepare(
        &self,
        _request: CreateThread,
    ) -> impl std::future::Future<Output = Result<ThreadBootstrap, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.prepare")) }
    }

    fn thread_create(
        &self,
        _request: CreateThread,
    ) -> impl std::future::Future<Output = Result<ThreadSummary, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.create")) }
    }

    fn thread_list(
        &self,
    ) -> impl std::future::Future<Output = Result<Vec<ThreadSummary>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.list")) }
    }

    fn thread_get(
        &self,
        _id: ThreadId,
    ) -> impl std::future::Future<Output = Result<ThreadSessionView, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.get")) }
    }

    fn thread_prompt(
        &self,
        _id: ThreadId,
        _blocks: Vec<ContentBlock>,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.prompt")) }
    }

    fn thread_queue_list(
        &self,
        _id: ThreadId,
    ) -> impl std::future::Future<Output = Result<Vec<QueuedPrompt>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.queue_list")) }
    }

    fn thread_queue_add(
        &self,
        _id: ThreadId,
        _blocks: Vec<ContentBlock>,
    ) -> impl std::future::Future<Output = Result<QueuedPrompt, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.queue_add")) }
    }

    fn thread_queue_remove(
        &self,
        _id: ThreadId,
        _queued_id: String,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.queue_remove")) }
    }

    fn thread_queue_reorder(
        &self,
        _id: ThreadId,
        _ordered_ids: Vec<String>,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.queue_reorder")) }
    }

    fn thread_cancel(
        &self,
        _id: ThreadId,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.cancel")) }
    }

    /// Current cancel phase and (while pending) the grace deadline.
    /// Overridden by M1.12; the webview renders from the deadline.
    fn thread_cancel_state(
        &self,
        _id: ThreadId,
    ) -> impl std::future::Future<Output = Result<CancelState, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.cancel_state")) }
    }

    fn thread_resume(
        &self,
        _id: ThreadId,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.resume")) }
    }

    /// One page of Provider sessions for the trusted root; cursor in/out.
    fn thread_list_provider_sessions(
        &self,
        _profile_id: String,
        _workspace_id: String,
        _cursor: Option<String>,
    ) -> impl std::future::Future<Output = Result<ProviderSessionPage, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.list_provider_sessions")) }
    }

    fn thread_import_sessions(
        &self,
        _profile_id: String,
        _workspace_id: String,
    ) -> impl std::future::Future<Output = Result<Vec<ThreadSummary>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.import_sessions")) }
    }

    fn thread_respond_extension(
        &self,
        _id: ThreadId,
        _request_id: String,
        _response_json: String,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.respond_extension")) }
    }

    fn thread_delete_provider_session(
        &self,
        _id: ThreadId,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.delete_provider_session")) }
    }

    fn thread_fork(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.fork")) }
    }

    fn thread_archive(
        &self,
        _id: ThreadId,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.archive")) }
    }

    fn thread_delete(
        &self,
        _id: ThreadId,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.delete")) }
    }

    fn thread_set_config_option(
        &self,
        _id: ThreadId,
        _option_id: String,
        _value: String,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.set_config_option")) }
    }

    fn thread_set_permission_mode(
        &self,
        _id: ThreadId,
        _mode: tethys_schema::workspace::PermissionMode,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.set_permission_mode")) }
    }
}
