//! `permission.*` implementations.

use tethys_api::{ApiError, PermissionApi};
use tethys_schema::elicitation::ElicitationResponse;
use tethys_schema::thread::ThreadId;

use crate::Core;

impl PermissionApi for Core {
    async fn permission_respond(
        &self,
        thread_id: ThreadId,
        req_id: String,
        option_id: Option<String>,
    ) -> Result<(), ApiError> {
        self.sessions
            .respond_permission(&thread_id, &req_id, option_id)
    }

    async fn elicitation_respond(
        &self,
        thread_id: ThreadId,
        response: ElicitationResponse,
    ) -> Result<(), ApiError> {
        self.sessions.respond_elicitation(&thread_id, response)
    }
}
