//! `thread.*` namespace (`architecture.md` §12.1).

use tethys_schema::thread::{
    ContentBlock, CreateThread, ThreadId, ThreadSummary, ThreadView,
};

use crate::ApiError;

/// Thread lifecycle, prompting, queue and config methods.
pub trait ThreadApi: Send + Sync {
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
    ) -> impl std::future::Future<Output = Result<ThreadView, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.get")) }
    }

    fn thread_prompt(
        &self,
        _id: ThreadId,
        _blocks: Vec<ContentBlock>,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.prompt")) }
    }

    fn thread_queue_list(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.queue_list")) }
    }

    fn thread_queue_add(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.queue_add")) }
    }

    fn thread_queue_remove(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.queue_remove")) }
    }

    fn thread_queue_reorder(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.queue_reorder")) }
    }

    fn thread_cancel(
        &self,
        _id: ThreadId,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.cancel")) }
    }

    fn thread_resume(
        &self,
        _id: ThreadId,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.resume")) }
    }

    fn thread_import_sessions(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.import_sessions")) }
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
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.set_config_option")) }
    }

    fn thread_set_permission_mode(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.set_permission_mode")) }
    }
}
