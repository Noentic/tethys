//! `workspace.*` namespace (`architecture.md` §12.1).

use tethys_schema::catalog::{TrustGrant, WorkspaceListItem, WorkspaceTrustState};
use tethys_schema::sync::WorkspaceId;
use tethys_schema::workspace::Vcs;
use tethys_schema::WorkspaceCapabilities;

use crate::ApiError;

/// Workspace catalog, trust and capability methods.
pub trait WorkspaceApi: Send + Sync {
    fn workspace_list(
        &self,
    ) -> impl std::future::Future<Output = Result<Vec<WorkspaceListItem>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.list")) }
    }

    /// The one path-taking method: adding a workspace *is* the trust flow
    /// (architecture principle 8's stated exception).
    fn workspace_add(
        &self,
        _request: TrustGrant,
    ) -> impl std::future::Future<Output = Result<WorkspaceListItem, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.add")) }
    }

    /// Initializes Git in an already trusted workspace without changing its trust grant.
    fn workspace_initialize_git(
        &self,
        _workspace_id: WorkspaceId,
    ) -> impl std::future::Future<Output = Result<WorkspaceCapabilities, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.initialize_git")) }
    }

    fn workspace_remove(
        &self,
        _workspace_id: WorkspaceId,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.remove")) }
    }

    /// Read-only VCS inspection of a picked folder, for the trust dialog's
    /// copy. No side effects: it never adds or trusts anything.
    fn workspace_probe(
        &self,
        _path: String,
    ) -> impl std::future::Future<Output = Result<Vcs, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.probe")) }
    }

    fn workspace_settings_get(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.settings_get")) }
    }

    fn workspace_settings_set(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.settings_set")) }
    }

    fn workspace_status(
        &self,
        _workspace_id: WorkspaceId,
    ) -> impl std::future::Future<Output = Result<WorkspaceTrustState, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.status")) }
    }

    fn workspace_capabilities(
        &self,
        _workspace_id: WorkspaceId,
    ) -> impl std::future::Future<Output = Result<WorkspaceCapabilities, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.capabilities")) }
    }
}
