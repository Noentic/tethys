//! Elicitation responder contract (M1.7 U2/U4).
//!
//! Symmetric to [`crate::connection::PermissionResolver`]: the ACP client hands
//! a normalized request to the responder and awaits the user's answer. The
//! concrete responder (and its pending map) lives in `tethys-core`, so the
//! webview only ever sends an [`ElicitationResponse`] back through the transport.

use async_trait::async_trait;
use tethys_schema::elicitation::{ElicitationRequest, ElicitationResponse};

use crate::connection::SessionId;

/// Answers an elicitation request. Never panics; a cancelled thread resolves to
/// an [`ElicitationResponse`] with a `Cancelled` outcome.
#[async_trait]
pub trait ElicitationResolver: Send + Sync {
    async fn resolve(
        &self,
        session: &SessionId,
        request: ElicitationRequest,
    ) -> ElicitationResponse;
}
