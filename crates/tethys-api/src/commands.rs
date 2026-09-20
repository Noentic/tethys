//! `commands.*` namespace (`architecture.md` §12.1).

use tethys_schema::composer::{CommandInfo, ExpandedCommand};
use tethys_schema::sync::WorkspaceId;

use crate::ApiError;

/// Slash-command discovery and expansion.
pub trait CommandsApi: Send + Sync {
    fn commands_list(
        &self,
        _workspace_id: Option<WorkspaceId>,
    ) -> impl std::future::Future<Output = Result<Vec<CommandInfo>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("commands.list")) }
    }

    fn commands_expand(
        &self,
        _command: String,
        _args_text: String,
        _workspace_id: Option<WorkspaceId>,
    ) -> impl std::future::Future<Output = Result<ExpandedCommand, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("commands.expand")) }
    }
}
