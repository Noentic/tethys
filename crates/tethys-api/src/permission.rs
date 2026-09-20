//! `permission.*` namespace (`architecture.md` §12.1).

use tethys_schema::elicitation::ElicitationResponse;
use tethys_schema::thread::ThreadId;

use crate::ApiError;

/// Permission response and rule methods.
pub trait PermissionApi: Send + Sync {
    /// Answers a surfaced permission request with the Provider's own
    /// `option_id` (`None` cancels).
    fn permission_respond(
        &self,
        _thread_id: ThreadId,
        _req_id: String,
        _option_id: Option<String>,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("permission.respond")) }
    }

    /// Answers a surfaced elicitation request (`accept` / `decline` / `cancel`).
    fn elicitation_respond(
        &self,
        _thread_id: ThreadId,
        _response: ElicitationResponse,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("permission.elicitation_respond")) }
    }

    fn permission_rules_list(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("permission.rules_list")) }
    }

    fn permission_rules_set(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("permission.rules_set")) }
    }

    fn permission_rules_delete(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("permission.rules_delete")) }
    }
}
