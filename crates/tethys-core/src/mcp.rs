//! `mcp.*` namespace implementation.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use tethys_api::{ApiError, McpApi};
use tethys_schema::sync::{
    Applied, ImportCandidate, ImportScan, ProjectionPlan, RegistryEntry, RegistryEntryView, Scope,
    TargetId, VerifyStatus,
};
use tethys_sync::import::{self as sync_import, ScanRequest};
use tethys_sync::projection::{self, ApplyRequest, PlanRequest};
use tethys_sync::registry::{
    global_registry_path, project_registry_path, read_registry, write_registry, Registry,
    RegistryFile,
};
use tethys_sync::{applied_from_row, applied_to_row, projector_for, read_text, SyncError};

use crate::Core;

impl McpApi for Core {
    async fn mcp_registry_list(
        &self,
        project_root: Option<String>,
    ) -> Result<Vec<RegistryEntryView>, ApiError> {
        let (global, project) = self.registry_paths(project_root.as_deref());
        let registry = Registry::load(Some(&global), project.as_deref()).map_err(internal)?;
        let mut views = Vec::new();
        for (name, entry) in &registry.global.mcp_servers {
            views.push(view(name, Scope::Global, entry));
        }
        for (name, entry) in &registry.project.mcp_servers {
            views.push(view(name, Scope::Project, entry));
        }
        Ok(views)
    }

    async fn mcp_registry_set(
        &self,
        name: String,
        mut entry: RegistryEntry,
        scope: Scope,
        project_root: Option<String>,
    ) -> Result<(), ApiError> {
        let path = self.scope_registry_path(scope, project_root.as_deref())?;
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
        project_root: Option<String>,
    ) -> Result<bool, ApiError> {
        let path = self.scope_registry_path(scope, project_root.as_deref())?;
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
        target: TargetId,
        project_root: Option<String>,
    ) -> Result<Vec<RegistryEntryView>, ApiError> {
        let (global, project) = self.registry_paths(project_root.as_deref());
        let registry = Registry::load(Some(&global), project.as_deref()).map_err(internal)?;
        let scopes = registry.merged();
        Ok(registry
            .effective(target, &BTreeSet::new())
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

    async fn mcp_projection_plan(
        &self,
        target: TargetId,
        scope: Scope,
        project_root: String,
    ) -> Result<ProjectionPlan, ApiError> {
        let projector = projector_for(target)
            .ok_or_else(|| ApiError::Internal(format!("{target:?} has no file projector")))?;
        let path = target_path(projector.as_ref(), &project_root, &self.sync_home(), scope)?;
        let original = read_text(&path).map_err(internal)?;

        let (global, project) = self.registry_paths(Some(&project_root));
        let registry = Registry::load(Some(&global), project.as_deref()).map_err(internal)?;
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
        project_root: String,
    ) -> Result<(), ApiError> {
        let store = self.sync_store()?;
        let projector = projector_for(target)
            .ok_or_else(|| ApiError::Internal(format!("{target:?} has no file projector")))?;
        let path = target_path(projector.as_ref(), &project_root, &self.sync_home(), scope)?;
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
        project_root: String,
    ) -> Result<VerifyStatus, ApiError> {
        let store = self.sync_store()?;
        let projector = projector_for(target)
            .ok_or_else(|| ApiError::Internal(format!("{target:?} has no file projector")))?;
        let path = target_path(projector.as_ref(), &project_root, &self.sync_home(), scope)?;
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

    async fn mcp_import_scan(&self, project_root: String) -> Result<ImportScan, ApiError> {
        Ok(sync_import::scan(ScanRequest {
            root: Path::new(&project_root),
            home: &self.sync_home(),
        }))
    }

    async fn mcp_import_apply(
        &self,
        project_root: String,
        candidates: Vec<ImportCandidate>,
        scope: Scope,
    ) -> Result<Vec<String>, ApiError> {
        let path = self.scope_registry_path(scope, Some(&project_root))?;
        sync_import::apply_import(&path, &candidates, scope, Some(&self.sync_home()))
            .map_err(internal)
    }
}

impl Core {
    fn registry_paths(&self, project_root: Option<&str>) -> (PathBuf, Option<PathBuf>) {
        (
            global_registry_path(&self.sync_home()),
            project_root.map(|root| project_registry_path(Path::new(root))),
        )
    }

    fn scope_registry_path(
        &self,
        scope: Scope,
        project_root: Option<&str>,
    ) -> Result<PathBuf, ApiError> {
        match scope {
            Scope::Global => Ok(global_registry_path(&self.sync_home())),
            Scope::Project => project_root
                .map(|root| project_registry_path(Path::new(root)))
                .ok_or_else(|| {
                    ApiError::InvalidConfig("project scope needs a project root".into())
                }),
        }
    }
}

fn target_path(
    projector: &dyn tethys_sync::Projector,
    project_root: &str,
    home: &Path,
    scope: Scope,
) -> Result<PathBuf, ApiError> {
    projector
        .detect(Path::new(project_root), home)
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
