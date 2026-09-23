//! `workspace.*` implementations: the catalog, the trust flow, and the
//! capability resolver override (`architecture.md` §10.6, §12.1).

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tethys_api::{ApiError, WorkspaceApi};
use tethys_schema::catalog::{
    TrustGrant, TrustScope, WorkspaceListItem, WorkspaceSessionSummary, WorkspaceTrustState,
};
use tethys_schema::sync::WorkspaceId;
use tethys_schema::workspace::{PermissionMode, Vcs, WorkspaceCapabilities};
use tethys_store::TrustRow;

use crate::workspace::capability;
use crate::Core;

impl WorkspaceApi for Core {
    async fn workspace_list(&self) -> Result<Vec<WorkspaceListItem>, ApiError> {
        let store = self.sync_store()?.clone();
        let rows = store.list_workspaces().await.map_err(internal)?;
        let mut items = Vec::new();
        for row in rows {
            let id = WorkspaceId::new(&row.id);
            let Some(record) = self.trust().trust(&id).await? else {
                continue;
            };
            let state = crate::workspace_trust::trust_state_async(
                Some(record.clone()),
                PathBuf::from(&row.root_path),
            )
            .await;
            if state != WorkspaceTrustState::Trusted {
                continue;
            }
            let capabilities = self.resolve_capabilities(&id).await?;
            let sessions = self
                .sessions()
                .list()
                .into_iter()
                .filter(|thread| thread.workspace_id == row.id)
                .filter(|thread| thread.state != tethys_schema::thread::ThreadState::Archived)
                .map(|thread| WorkspaceSessionSummary {
                    id: thread.id.0.clone(),
                    agent_profile_id: thread.agent_profile_id,
                    title: thread.title,
                    state: thread.state,
                    workdir: thread.workdir,
                })
                .collect();
            items.push(WorkspaceListItem {
                id,
                name: name_for(&record.resolved_path),
                path: record.resolved_path,
                capabilities,
                trust: WorkspaceTrustState::Trusted,
                sessions,
            });
        }
        Ok(items)
    }

    async fn workspace_add(&self, request: TrustGrant) -> Result<WorkspaceListItem, ApiError> {
        let store = self.sync_store()?.clone();
        let raw = PathBuf::from(&request.path);
        if !raw.is_dir() {
            return Err(ApiError::InvalidConfig(format!(
                "not a directory: {}",
                request.path
            )));
        }
        let resolved = crate::normalize_path(&raw);
        let resolved_str = resolved.to_string_lossy().to_string();

        if request.init_git {
            let probe = resolved.clone();
            let is_plain = tokio::task::spawn_blocking(move || {
                matches!(capability::vcs_for_root(&probe), Vcs::None)
            })
            .await
            .map_err(|error| ApiError::Internal(format!("git check task failed: {error}")))?;
            if is_plain {
                let target = resolved.clone();
                let output = tokio::task::spawn_blocking(move || {
                    std::process::Command::new("git")
                        .args(["init", "-q"])
                        .current_dir(&target)
                        .output()
                })
                .await
                .map_err(|error| ApiError::Internal(format!("git init task failed: {error}")))?
                .map_err(|error| ApiError::Internal(format!("git init failed: {error}")))?;
                if !output.status.success() {
                    return Err(ApiError::Internal(format!(
                        "git init failed: {}",
                        String::from_utf8_lossy(&output.stderr).trim()
                    )));
                }
            }
        }

        // VCS status and the read-only remote URL are git reads, so they run
        // off the async worker (the repo's `blocking` convention).
        let (vcs, remote_url) = {
            let probe = resolved.clone();
            tokio::task::spawn_blocking(move || {
                let vcs = capability::vcs_for_root(&probe);
                let remote_url = tethys_git::remote_url(&probe, "origin").ok().flatten();
                (vcs, remote_url)
            })
            .await
            .map_err(|error| ApiError::Internal(format!("capability task failed: {error}")))?
        };
        let isolation = if matches!(vcs, Vcs::None) {
            "plain"
        } else {
            "worktree"
        };
        // The canonical path is the trust key and the stable workspace id, so a
        // re-add of the same folder updates instead of forking a second row.
        let id = resolved_str.clone();
        store
            .ensure_workspace(&id, &resolved_str, isolation)
            .await
            .map_err(internal)?;
        self.trust()
            .grant(TrustRow {
                workspace_id: id.clone(),
                resolved_path: resolved_str.clone(),
                host: "local".to_string(),
                remote_url,
                permission_mode: mode_str(request.permission_mode).to_string(),
                scope: scope_str(request.scope).to_string(),
                trusted_at: now_ms(),
            })
            .await?;
        self.invalidate_capabilities(&id);

        let workspace_id = WorkspaceId::new(&id);
        let capabilities = self.resolve_capabilities(&workspace_id).await?;
        Ok(WorkspaceListItem {
            id: workspace_id,
            name: name_for(&resolved_str),
            path: resolved_str,
            capabilities,
            trust: WorkspaceTrustState::Trusted,
            sessions: Vec::new(),
        })
    }

    async fn workspace_initialize_git(
        &self,
        workspace_id: WorkspaceId,
    ) -> Result<tethys_schema::WorkspaceCapabilities, ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        let probe = root.clone();
        let is_plain = tokio::task::spawn_blocking(move || {
            matches!(capability::vcs_for_root(&probe), Vcs::None)
        })
        .await
        .map_err(|error| ApiError::Internal(format!("git check task failed: {error}")))?;
        if is_plain {
            tokio::task::spawn_blocking(move || {
                std::process::Command::new("git")
                    .args(["init", "-q"])
                    .current_dir(root)
                    .output()
            })
            .await
            .map_err(|error| ApiError::Internal(format!("git init task failed: {error}")))?
            .map_err(|error| ApiError::Internal(format!("git init failed: {error}")))
            .and_then(|output| {
                if output.status.success() {
                    Ok(())
                } else {
                    Err(ApiError::Internal(format!(
                        "git init failed: {}",
                        String::from_utf8_lossy(&output.stderr).trim()
                    )))
                }
            })?;
        }
        self.invalidate_capabilities(workspace_id.as_str());
        self.resolve_capabilities(&workspace_id).await
    }

    async fn workspace_remove(&self, workspace_id: WorkspaceId) -> Result<(), ApiError> {
        self.trust().revoke(&workspace_id).await?;
        self.invalidate_capabilities(workspace_id.as_str());
        Ok(())
    }

    async fn workspace_probe(&self, path: String) -> Result<Vcs, ApiError> {
        let probe = PathBuf::from(&path);
        if !probe.is_dir() {
            return Err(ApiError::InvalidConfig(format!("not a directory: {path}")));
        }
        tokio::task::spawn_blocking(move || capability::vcs_for_root(&probe))
            .await
            .map_err(|error| ApiError::Internal(format!("capability task failed: {error}")))
    }

    async fn workspace_status(
        &self,
        workspace_id: WorkspaceId,
    ) -> Result<WorkspaceTrustState, ApiError> {
        let store = self.sync_store()?.clone();
        let row = store
            .workspace(workspace_id.as_str())
            .await
            .map_err(internal)?
            .ok_or_else(|| {
                ApiError::NotFound(format!("workspace not found: {}", workspace_id.as_str()))
            })?;
        let record = self.trust().trust(&workspace_id).await?;
        Ok(crate::workspace_trust::trust_state_async(record, PathBuf::from(&row.root_path)).await)
    }

    async fn workspace_capabilities(
        &self,
        workspace_id: WorkspaceId,
    ) -> Result<WorkspaceCapabilities, ApiError> {
        self.resolve_capabilities(&workspace_id).await
    }
}

fn mode_str(mode: PermissionMode) -> &'static str {
    match mode {
        PermissionMode::Supervised => "supervised",
        PermissionMode::AutoEdit => "auto-edit",
        PermissionMode::Yolo => "yolo",
    }
}

fn scope_str(scope: TrustScope) -> &'static str {
    match scope {
        TrustScope::Folder => "folder",
        TrustScope::Subtree => "subtree",
    }
}

fn name_for(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn internal(error: impl std::fmt::Display) -> ApiError {
    ApiError::Internal(error.to_string())
}
