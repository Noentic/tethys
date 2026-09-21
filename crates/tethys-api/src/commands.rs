//! `commands.*` namespace (`architecture.md` §12.1).

use tethys_schema::composer::{CommandInfo, CommandScope, CommandSource, ExpandedCommand};
use tethys_schema::sync::WorkspaceId;

use crate::ApiError;

/// Slash-command discovery, expansion, and authoring (CMP-01, CMP-07).
pub trait CommandsApi: Send + Sync {
    /// `include_shadowed = false` keeps composer semantics (workspace wins);
    /// `true` returns both scopes for the Settings editor.
    fn commands_list(
        &self,
        _workspace_id: Option<WorkspaceId>,
        _include_shadowed: bool,
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

    fn commands_read(
        &self,
        _scope: CommandScope,
        _name: String,
        _workspace_id: Option<WorkspaceId>,
    ) -> impl std::future::Future<Output = Result<CommandSource, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("commands.read")) }
    }

    fn commands_write(
        &self,
        _scope: CommandScope,
        _name: String,
        _body: String,
        _workspace_id: Option<WorkspaceId>,
    ) -> impl std::future::Future<Output = Result<CommandInfo, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("commands.write")) }
    }

    fn commands_delete(
        &self,
        _scope: CommandScope,
        _name: String,
        _workspace_id: Option<WorkspaceId>,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("commands.delete")) }
    }
}
