//! `mcp.*` namespace (`architecture.md` §12.1).

use tethys_schema::sync::{
    Applied, AttachmentGrid, ImportCandidate, ImportScan, ProjectionPlan, RegistryEntry,
    RegistryEntryView, Scope, TargetId, VerifyStatus, WorkspaceId,
};

use crate::ApiError;

/// Registry, projection, and import methods.
pub trait McpApi: Send + Sync {
    fn mcp_registry_list(
        &self,
        _workspace_id: Option<WorkspaceId>,
    ) -> impl std::future::Future<Output = Result<Vec<RegistryEntryView>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("mcp.registry_list")) }
    }

    fn mcp_registry_set(
        &self,
        _name: String,
        _entry: RegistryEntry,
        _scope: Scope,
        _workspace_id: Option<WorkspaceId>,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("mcp.registry_set")) }
    }

    fn mcp_registry_delete(
        &self,
        _name: String,
        _scope: Scope,
        _workspace_id: Option<WorkspaceId>,
    ) -> impl std::future::Future<Output = Result<bool, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("mcp.registry_delete")) }
    }

    fn mcp_effective(
        &self,
        _provider_id: Option<String>,
        _workspace_id: Option<WorkspaceId>,
    ) -> impl std::future::Future<Output = Result<Vec<RegistryEntryView>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("mcp.effective")) }
    }

    fn mcp_attachments(
        &self,
        _workspace_id: WorkspaceId,
    ) -> impl std::future::Future<Output = Result<AttachmentGrid, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("mcp.attachments")) }
    }

    fn mcp_projection_plan(
        &self,
        _workspace_id: WorkspaceId,
        _target: TargetId,
        _scope: Scope,
    ) -> impl std::future::Future<Output = Result<ProjectionPlan, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("mcp.projection_plan")) }
    }

    fn mcp_projection_apply(
        &self,
        _workspace_id: WorkspaceId,
        _target: TargetId,
        _scope: Scope,
        _plan: ProjectionPlan,
    ) -> impl std::future::Future<Output = Result<Applied, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("mcp.projection_apply")) }
    }

    fn mcp_projection_rollback(
        &self,
        _workspace_id: WorkspaceId,
        _target: TargetId,
        _scope: Scope,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("mcp.projection_rollback")) }
    }

    fn mcp_projection_verify(
        &self,
        _workspace_id: WorkspaceId,
        _target: TargetId,
        _scope: Scope,
    ) -> impl std::future::Future<Output = Result<VerifyStatus, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("mcp.projection_verify")) }
    }

    fn mcp_import_scan(
        &self,
        _workspace_id: WorkspaceId,
    ) -> impl std::future::Future<Output = Result<ImportScan, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("mcp.import_scan")) }
    }

    fn mcp_import_apply(
        &self,
        _workspace_id: WorkspaceId,
        _candidates: Vec<ImportCandidate>,
        _scope: Scope,
    ) -> impl std::future::Future<Output = Result<Vec<String>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("mcp.import_apply")) }
    }

    fn mcp_health(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("mcp.health")) }
    }
}
