//! `workspace.*` namespace (`architecture.md` §12.1).

use tethys_schema::sync::WorkspaceId;
use tethys_schema::WorkspaceCapabilities;

use crate::ApiError;

/// Workspace catalog, trust and capability methods.
pub trait WorkspaceApi: Send + Sync {
    fn workspace_list(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.list")) }
    }

    fn workspace_add(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.add")) }
    }

    fn workspace_remove(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.remove")) }
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

    fn workspace_status(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.status")) }
    }

    fn workspace_capabilities(
        &self,
        _workspace_id: WorkspaceId,
    ) -> impl std::future::Future<Output = Result<WorkspaceCapabilities, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.capabilities")) }
    }
}
