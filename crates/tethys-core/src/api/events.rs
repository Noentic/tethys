//! `events.*` implementations.

use tethys_api::{ApiError, EventStream, EventsApi};
use tethys_schema::thread::ThreadId;

use crate::Core;

impl EventsApi for Core {
    async fn events_subscribe(
        &self,
        thread_id: ThreadId,
        since_seq: u32,
    ) -> Result<EventStream, ApiError> {
        self.sessions.subscribe(&thread_id, since_seq)
    }
}
