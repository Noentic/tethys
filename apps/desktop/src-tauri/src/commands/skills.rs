//! `skills.*` commands.

use tauri::State;
use tethys_api::SkillsApi;
use tethys_schema::sync::{
    Scope, SkillImportSource, SkillInfo, SkillUpdateApplied, SkillUpdateCheck, SkillUpdatePlan,
    WorkspaceId,
};

use crate::commands::CoreState;

/// `skills.list` — canonical home scan with trust facts.
#[tauri::command]
#[specta::specta]
pub async fn skills_list(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
) -> Result<Vec<SkillInfo>, String> {
    state
        .skills_list(workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `skills.import` — folder, archive, or GitHub import.
#[tauri::command]
#[specta::specta]
pub async fn skills_import(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    scope: Scope,
    source: SkillImportSource,
) -> Result<SkillInfo, String> {
    state
        .skills_import(workspace_id, scope, source)
        .await
        .map_err(|e| e.to_string())
}

/// `skills.update.check` — cheap upstream SHA comparison.
#[tauri::command]
#[specta::specta]
pub async fn skills_update_check(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    scope: Scope,
    name: String,
) -> Result<SkillUpdateCheck, String> {
    state
        .skills_update_check(workspace_id, scope, name)
        .await
        .map_err(|e| e.to_string())
}

/// `skills.update.plan` — download and diff without writing.
#[tauri::command]
#[specta::specta]
pub async fn skills_update_plan(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    scope: Scope,
    name: String,
) -> Result<SkillUpdatePlan, String> {
    state
        .skills_update_plan(workspace_id, scope, name)
        .await
        .map_err(|e| e.to_string())
}

/// `skills.update.apply` — swap atomically and clear trust.
#[tauri::command]
#[specta::specta]
pub async fn skills_update_apply(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    scope: Scope,
    name: String,
) -> Result<SkillUpdateApplied, String> {
    state
        .skills_update_apply(workspace_id, scope, name)
        .await
        .map_err(|e| e.to_string())
}

/// `skills.trust` — bind trust to the current content hash.
#[tauri::command]
#[specta::specta]
pub async fn skills_trust(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    scope: Scope,
    name: String,
) -> Result<SkillInfo, String> {
    state
        .skills_trust(workspace_id, scope, name)
        .await
        .map_err(|e| e.to_string())
}

/// `skills.enable` — toggle without deleting.
#[tauri::command]
#[specta::specta]
pub async fn skills_enable(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    scope: Scope,
    name: String,
    enabled: bool,
) -> Result<SkillInfo, String> {
    state
        .skills_enable(workspace_id, scope, name, enabled)
        .await
        .map_err(|e| e.to_string())
}
