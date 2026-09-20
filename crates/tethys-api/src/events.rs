//! `events.*` namespace (`architecture.md` §12.1).

use tethys_schema::thread::ThreadId;

use crate::{ApiError, EventStream};

/// Thread and inbox subscription methods.
pub trait EventsApi: Send + Sync {
    fn events_subscribe(
        &self,
        _thread_id: ThreadId,
        _since_seq: u32,
    ) -> impl std::future::Future<Output = Result<EventStream, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("events.subscribe")) }
    }

    fn events_unsubscribe(
        &self,
        _thread_id: ThreadId,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("events.unsubscribe")) }
    }

    fn events_inbox_subscribe(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("events.inbox_subscribe")) }
    }
}
