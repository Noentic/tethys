//! `mcp.*` namespace implementation.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};

use tethys_api::{ApiError, McpApi};
use tethys_schema::connection::ConnectionState;
use tethys_schema::sync::{
    Applied, AttachmentGrid, EntryState, ImportCandidate, ImportScan, ProjectionPlan,
    ProjectionTarget, RegistryEntry, RegistryEntryView, Scope, TargetId, VerifyStatus, WorkspaceId,
};
use tethys_sync::attachments::{compute_attachment_grid, ProviderInput};
use tethys_sync::import::{self as sync_import, ScanRequest};
use tethys_sync::projection::{self, ApplyRequest, PlanRequest};
use tethys_sync::registry::{
    global_registry_path, read_registry, workspace_registry_path, write_registry, Registry,
    RegistryFile,
};
use tethys_sync::{applied_from_row, applied_to_row, projector_for, read_text, SyncError};

use crate::Core;

impl McpApi for Core {
    async fn mcp_registry_list(
        &self,
        workspace_id: Option<WorkspaceId>,
    ) -> Result<Vec<RegistryEntryView>, ApiError> {
        let root = self.resolve_workspace_root(workspace_id.as_ref()).await?;
        let (global, workspace) = self.registry_paths(root.as_deref());
        let registry = Registry::load(Some(&global), workspace.as_deref()).map_err(internal)?;
        let mut views = Vec::new();
        for (name, entry) in &registry.global.mcp_servers {
            views.push(view(name, Scope::Global, entry));
        }
        for (name, entry) in &registry.workspace.mcp_servers {
            views.push(view(name, Scope::Workspace, entry));
        }
        Ok(views)
    }

    async fn mcp_registry_set(
        &self,
        name: String,
        mut entry: RegistryEntry,
        scope: Scope,
        workspace_id: Option<WorkspaceId>,
    ) -> Result<(), ApiError> {
        let root = self.resolve_workspace_root(workspace_id.as_ref()).await?;
        let path = self.scope_registry_path(scope, root.as_deref())?;
        let mut file = read_registry(&path)
            .map_err(internal)?
            .unwrap_or_else(RegistryFile::default);
        entry.meta.scope = Some(scope);
        file.mcp_servers.insert(name, entry);
        write_registry(&path, &file, Some(&self.sync_home())).map_err(internal)
    }

    async fn mcp_registry_delete(
        &self,
        name: String,
        scope: Scope,
        workspace_id: Option<WorkspaceId>,
    ) -> Result<bool, ApiError> {
        let root = self.resolve_workspace_root(workspace_id.as_ref()).await?;
        let path = self.scope_registry_path(scope, root.as_deref())?;
        let Some(mut file) = read_registry(&path).map_err(internal)? else {
            return Ok(false);
        };
        let removed = file.mcp_servers.remove(&name).is_some();
        if removed {
            write_registry(&path, &file, Some(&self.sync_home())).map_err(internal)?;
        }
        Ok(removed)
    }

    async fn mcp_effective(
        &self,
        provider_id: Option<String>,
        workspace_id: Option<WorkspaceId>,
    ) -> Result<Vec<RegistryEntryView>, ApiError> {
        let root = self.resolve_workspace_root(workspace_id.as_ref()).await?;
        let (global, workspace) = self.registry_paths(root.as_deref());
        let registry = Registry::load(Some(&global), workspace.as_deref()).map_err(internal)?;
        let scopes = registry.merged();
        Ok(registry
            .effective_for_provider(provider_id.as_deref(), &BTreeSet::new())
            .into_iter()
            .map(|(name, entry)| {
                let scope = scopes
                    .get(&name)
                    .map(|(scope, _)| *scope)
                    .unwrap_or(Scope::Global);
                view(&name, scope, &entry)
            })
            .collect())
    }

    async fn mcp_attachments(&self, workspace_id: WorkspaceId) -> Result<AttachmentGrid, ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        let (global, workspace) = self.registry_paths(Some(&root));
        let registry = Registry::load(Some(&global), workspace.as_deref()).map_err(internal)?;

        let servers: Vec<(String, RegistryEntry, Scope)> = registry
            .merged()
            .into_iter()
            .filter(|(name, (_, entry))| {
                entry.meta.enabled && !self.sessions.sync().disabled.contains(name)
            })
            .map(|(name, (scope, entry))| (name, entry, scope))
            .collect();

        let profiles = self.sessions.profiles_compat();
        let mut provider_inputs: Vec<ProviderInput> = Vec::new();
        let mut target_states: HashMap<ProjectionTarget, HashMap<String, EntryState>> =
            HashMap::new();

        for (profile_id, key, compat) in profiles {
            let entry = self.sessions.store().entry(&key);
            let connected = entry
                .as_ref()
                .map(|e| e.state == ConnectionState::Connected)
                .unwrap_or(false);
            let capabilities = if connected {
                entry.as_ref().and_then(|e| e.capabilities.clone())
            } else {
                None
            };
            let name = entry
                .as_ref()
                .and_then(|e| e.info.as_ref().map(|i| i.name.clone()))
                .unwrap_or_else(|| profile_id.clone());

            let projection_states = if let Some(target) = compat.projection_target {
                if let Some(states) = target_states.get(&target) {
                    states.clone()
                } else {
                    let states = self.compute_projection_states_for_target(&root, target).await?;
                    target_states.insert(target, states.clone());
                    states
                }
            } else {
                HashMap::new()
            };

            provider_inputs.push(ProviderInput {
                id: profile_id.clone(),
                name,
                connected,
                capabilities,
                projection_target: compat.projection_target,
                projection_states,
            });
        }

        let live_entries = self.sessions.store().entries();
        for live in live_entries {
            if !provider_inputs.iter().any(|p| p.id == live.key.profile_id) {
                let connected = live.state == ConnectionState::Connected;
                let capabilities = if connected { live.capabilities } else { None };
                provider_inputs.push(ProviderInput {
                    id: live.key.profile_id.clone(),
                    name: live
                        .info
                        .as_ref()
                        .map(|i| i.name.clone())
                        .unwrap_or_else(|| live.key.profile_id.clone()),
                    connected,
                    capabilities,
                    projection_target: None,
                    projection_states: HashMap::new(),
                });
            }
        }

        provider_inputs.sort_by(|a, b| a.id.cmp(&b.id));

        Ok(compute_attachment_grid(&servers, &provider_inputs))
    }

    async fn mcp_projection_plan(
        &self,
        target: TargetId,
        scope: Scope,
        workspace_id: WorkspaceId,
    ) -> Result<ProjectionPlan, ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        let root_str = root.display().to_string();
        let projector = projector_for(target)
            .ok_or_else(|| ApiError::Internal(format!("{target:?} has no file projector")))?;
        let path = target_path(projector.as_ref(), &root_str, &self.sync_home(), scope)?;
        let original = read_text(&path).map_err(internal)?;

        let (global, workspace) = self.registry_paths(Some(&root));
        let registry = Registry::load(Some(&global), workspace.as_deref()).map_err(internal)?;
        let desired = registry.effective(target, &BTreeSet::new());

        let owned = match &self.store {
            Some(store) => match store
                .projection(target.as_str(), &path.display().to_string())
                .await
                .map_err(store_error)?
            {
                Some(row) => applied_from_row(&row).map_err(internal)?.entries,
                None => BTreeMap::new(),
            },
            None => BTreeMap::new(),
        };

        projection::plan(PlanRequest {
            projector: projector.as_ref(),
            path: &path,
            scope,
            original: original.as_deref(),
            desired: &desired,
            owned: &owned,
        })
        .map_err(internal)
    }

    async fn mcp_projection_apply(&self, plan: ProjectionPlan) -> Result<Applied, ApiError> {
        let store = self.sync_store()?;
        let projector = projector_for(plan.target).ok_or_else(|| {
            ApiError::Internal(format!("{:?} has no file projector", plan.target))
        })?;
        let applied = projection::apply(ApplyRequest {
            projector: projector.as_ref(),
            plan: &plan,
            home: &self.sync_home(),
        })
        .map_err(internal)?;
        store
            .upsert_projection(applied_to_row(&applied, now_ms()).map_err(internal)?)
            .await
            .map_err(store_error)?;
        Ok(applied)
    }

    async fn mcp_projection_rollback(
        &self,
        target: TargetId,
        scope: Scope,
        workspace_id: WorkspaceId,
    ) -> Result<(), ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        let root_str = root.display().to_string();
        let store = self.sync_store()?;
        let projector = projector_for(target)
            .ok_or_else(|| ApiError::Internal(format!("{target:?} has no file projector")))?;
        let path = target_path(projector.as_ref(), &root_str, &self.sync_home(), scope)?;
        let path_string = path.display().to_string();
        let row = store
            .projection(target.as_str(), &path_string)
            .await
            .map_err(store_error)?
            .ok_or_else(|| ApiError::NotFound(format!("projection {path_string}")))?;
        let applied = applied_from_row(&row).map_err(internal)?;
        projection::rollback(&applied, &self.sync_home(), false).map_err(internal)?;
        store
            .delete_projection(target.as_str(), &path_string)
            .await
            .map_err(store_error)?;
        Ok(())
    }

    async fn mcp_projection_verify(
        &self,
        target: TargetId,
        scope: Scope,
        workspace_id: WorkspaceId,
    ) -> Result<VerifyStatus, ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        let root_str = root.display().to_string();
        let store = self.sync_store()?;
        let projector = projector_for(target)
            .ok_or_else(|| ApiError::Internal(format!("{target:?} has no file projector")))?;
        let path = target_path(projector.as_ref(), &root_str, &self.sync_home(), scope)?;
        let path_string = path.display().to_string();
        let Some(row) = store
            .projection(target.as_str(), &path_string)
            .await
            .map_err(store_error)?
        else {
            return Ok(VerifyStatus::Missing);
        };
        let applied = applied_from_row(&row).map_err(internal)?;
        projection::verify(&path, &applied).map_err(internal)
    }

    async fn mcp_import_scan(&self, workspace_id: WorkspaceId) -> Result<ImportScan, ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        Ok(sync_import::scan(ScanRequest {
            root: &root,
            home: &self.sync_home(),
        }))
    }

    async fn mcp_import_apply(
        &self,
        workspace_id: WorkspaceId,
        candidates: Vec<ImportCandidate>,
        scope: Scope,
    ) -> Result<Vec<String>, ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        let path = self.scope_registry_path(scope, Some(&root))?;
        sync_import::apply_import(&path, &candidates, scope, Some(&self.sync_home()))
            .map_err(internal)
    }
}

impl Core {
    async fn resolve_workspace_root(
        &self,
        id: Option<&WorkspaceId>,
    ) -> Result<Option<PathBuf>, ApiError> {
        match id {
            Some(id) => Ok(Some(self.workspace_roots.root(id).await?)),
            None => Ok(None),
        }
    }

    fn registry_paths(&self, workspace_root: Option<&Path>) -> (PathBuf, Option<PathBuf>) {
        (
            global_registry_path(&self.sync_home()),
            workspace_root.map(workspace_registry_path),
        )
    }

    async fn compute_projection_states_for_target(
        &self,
        root: &Path,
        target: ProjectionTarget,
    ) -> Result<HashMap<String, EntryState>, ApiError> {
        let target_id = TargetId::from(target);
        let projector = match projector_for(target_id) {
            Some(p) => p,
            None => return Ok(HashMap::new()),
        };
        let root_str = root.display().to_string();
        let path = match target_path(
            projector.as_ref(),
            &root_str,
            &self.sync_home(),
            Scope::Workspace,
        ) {
            Ok(p) => p,
            Err(_) => return Ok(HashMap::new()),
        };
        let original = read_text(&path).map_err(internal)?;

        let (global, workspace) = self.registry_paths(Some(root));
        let registry = Registry::load(Some(&global), workspace.as_deref()).map_err(internal)?;
        let desired = registry.effective(target_id, &BTreeSet::new());

        let owned = match &self.store {
            Some(store) => match store
                .projection(target_id.as_str(), &path.display().to_string())
                .await
                .map_err(store_error)?
            {
                Some(row) => applied_from_row(&row).map_err(internal)?.entries,
                None => BTreeMap::new(),
            },
            None => BTreeMap::new(),
        };

        let plan = projection::plan(PlanRequest {
            projector: projector.as_ref(),
            path: &path,
            scope: Scope::Workspace,
            original: original.as_deref(),
            desired: &desired,
            owned: &owned,
        })
        .map_err(internal)?;

        let mut states = HashMap::new();
        for entry in plan.entries {
            states.insert(entry.name, entry.state);
        }
        Ok(states)
    }

    fn scope_registry_path(
        &self,
        scope: Scope,
        workspace_root: Option<&Path>,
    ) -> Result<PathBuf, ApiError> {
        match scope {
            Scope::Global => Ok(global_registry_path(&self.sync_home())),
            Scope::Workspace => workspace_root
                .map(workspace_registry_path)
                .ok_or_else(|| {
                    ApiError::InvalidConfig("workspace scope needs a workspace root".into())
                }),
        }
    }
}

fn target_path(
    projector: &dyn tethys_sync::Projector,
    workspace_root: &str,
    home: &Path,
    scope: Scope,
) -> Result<PathBuf, ApiError> {
    projector
        .detect(Path::new(workspace_root), home)
        .into_iter()
        .find(|file| file.scope == scope)
        .map(|file| file.path)
        .ok_or_else(|| {
            ApiError::InvalidConfig(format!(
                "{:?} has no {:?}-scope config",
                projector.target(),
                scope
            ))
        })
}

fn view(name: &str, scope: Scope, entry: &RegistryEntry) -> RegistryEntryView {
    RegistryEntryView {
        name: name.to_string(),
        scope,
        entry: entry.clone(),
    }
}

fn internal(error: SyncError) -> ApiError {
    ApiError::Internal(error.to_string())
}

fn store_error(error: tethys_store::StoreError) -> ApiError {
    ApiError::Internal(error.to_string())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}
