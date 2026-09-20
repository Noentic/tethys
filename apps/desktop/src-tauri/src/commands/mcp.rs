//! `mcp.*` commands.

use tauri::State;
use tethys_api::McpApi;
use tethys_schema::sync::{
    Applied, AttachmentGrid, ImportCandidate, ImportScan, ProjectionPlan, RegistryEntry,
    RegistryEntryView, Scope, TargetId, VerifyStatus, WorkspaceId,
};

use crate::commands::CoreState;

/// `mcp.registry.list` — registry entries from global and workspace scopes.
#[tauri::command]
#[specta::specta]
pub async fn mcp_registry_list(
    state: State<'_, CoreState>,
    workspace_id: Option<WorkspaceId>,
) -> Result<Vec<RegistryEntryView>, String> {
    state
        .mcp_registry_list(workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.registry.set` — upsert one registry entry.
#[tauri::command]
#[specta::specta]
pub async fn mcp_registry_set(
    state: State<'_, CoreState>,
    name: String,
    entry: RegistryEntry,
    scope: Scope,
    workspace_id: Option<WorkspaceId>,
) -> Result<(), String> {
    state
        .mcp_registry_set(name, entry, scope, workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.registry.delete` — remove one registry entry.
#[tauri::command]
#[specta::specta]
pub async fn mcp_registry_delete(
    state: State<'_, CoreState>,
    name: String,
    scope: Scope,
    workspace_id: Option<WorkspaceId>,
) -> Result<bool, String> {
    state
        .mcp_registry_delete(name, scope, workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.effective` — merged entries visible to one provider.
#[tauri::command]
#[specta::specta]
pub async fn mcp_effective(
    state: State<'_, CoreState>,
    provider_id: Option<String>,
    workspace_id: Option<WorkspaceId>,
) -> Result<Vec<RegistryEntryView>, String> {
    state
        .mcp_effective(provider_id, workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.attachments` — servers × providers attachment grid.
#[tauri::command]
#[specta::specta]
pub async fn mcp_attachments(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
) -> Result<AttachmentGrid, String> {
    state
        .mcp_attachments(workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.projection.plan` — preview a vendor config write.
#[tauri::command]
#[specta::specta]
pub async fn mcp_projection_plan(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    target: TargetId,
    scope: Scope,
) -> Result<ProjectionPlan, String> {
    state
        .mcp_projection_plan(workspace_id, target, scope)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.projection.apply` — write a plan after re-checking the file.
#[tauri::command]
#[specta::specta]
pub async fn mcp_projection_apply(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    target: TargetId,
    scope: Scope,
    plan: ProjectionPlan,
) -> Result<Applied, String> {
    state
        .mcp_projection_apply(workspace_id, target, scope, plan)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.projection.rollback` — restore the newest backup.
#[tauri::command]
#[specta::specta]
pub async fn mcp_projection_rollback(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    target: TargetId,
    scope: Scope,
) -> Result<(), String> {
    state
        .mcp_projection_rollback(workspace_id, target, scope)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.projection.verify` — compare a projected file against its manifest.
#[tauri::command]
#[specta::specta]
pub async fn mcp_projection_verify(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    target: TargetId,
    scope: Scope,
) -> Result<VerifyStatus, String> {
    state
        .mcp_projection_verify(workspace_id, target, scope)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.import.scan` — read-only detection across installed tools.
#[tauri::command]
#[specta::specta]
pub async fn mcp_import_scan(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
) -> Result<ImportScan, String> {
    state
        .mcp_import_scan(workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.import.apply` — write the chosen candidates into the registry.
#[tauri::command]
#[specta::specta]
pub async fn mcp_import_apply(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    candidates: Vec<ImportCandidate>,
    scope: Scope,
) -> Result<Vec<String>, String> {
    state
        .mcp_import_apply(workspace_id, candidates, scope)
        .await
        .map_err(|e| e.to_string())
}

// mcp.health arrives with M2.4.
stub_cmd!(mcp_health);
