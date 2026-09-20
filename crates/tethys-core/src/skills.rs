//! `skills.*` namespace implementation.

use std::fs;
use std::path::Path;

use tethys_api::{ApiError, SkillsApi};
use tethys_schema::sync::{
    Scope, SkillImportSource, SkillInfo, SkillUpdateApplied, SkillUpdateCheck, SkillUpdatePlan,
    WorkspaceId,
};
use tethys_sync::skill_import::{import_folder, import_github, import_zip, HttpDownloader};
use tethys_sync::skills::{self, SkillHome};
use tethys_sync::SyncError;

use crate::Core;

impl SkillsApi for Core {
    async fn skills_list(&self, workspace_id: WorkspaceId) -> Result<Vec<SkillInfo>, ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        let store = self.sync_store()?;
        let home = self.sync_home();
        skills::list(
            store,
            SkillHome {
                root: &root,
                home: &home,
            },
        )
        .await
        .map_err(internal)
    }

    async fn skills_import(
        &self,
        workspace_id: WorkspaceId,
        scope: Scope,
        source: SkillImportSource,
    ) -> Result<SkillInfo, ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        let store = self.sync_store()?;
        let home = self.sync_home();
        let skill_home = SkillHome {
            root: &root,
            home: &home,
        };
        match source {
            SkillImportSource::Folder { path } => {
                import_folder(store, skill_home, scope, None, Path::new(&path))
                    .await
                    .map_err(internal)
            }
            SkillImportSource::Archive { path } => {
                let bytes =
                    fs::read(&path).map_err(|error| ApiError::Internal(error.to_string()))?;
                import_zip(store, skill_home, scope, &bytes)
                    .await
                    .map_err(internal)
            }
            SkillImportSource::GitHub { spec } => import_github(store, skill_home, scope, &spec)
                .await
                .map_err(internal),
        }
    }

    async fn skills_update_check(
        &self,
        workspace_id: WorkspaceId,
        scope: Scope,
        name: String,
    ) -> Result<SkillUpdateCheck, ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        let store = self.sync_store()?;
        let home = self.sync_home();
        skills::update_check(
            store,
            SkillHome {
                root: &root,
                home: &home,
            },
            scope,
            &name,
        )
        .await
        .map_err(internal)
    }

    async fn skills_update_plan(
        &self,
        workspace_id: WorkspaceId,
        scope: Scope,
        name: String,
    ) -> Result<SkillUpdatePlan, ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        let store = self.sync_store()?;
        let home = self.sync_home();
        skills::update_plan(
            store,
            SkillHome {
                root: &root,
                home: &home,
            },
            scope,
            &name,
            &HttpDownloader,
        )
        .await
        .map_err(internal)
    }

    async fn skills_update_apply(
        &self,
        workspace_id: WorkspaceId,
        scope: Scope,
        name: String,
    ) -> Result<SkillUpdateApplied, ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        let store = self.sync_store()?;
        let home = self.sync_home();
        skills::update_apply(
            store,
            SkillHome {
                root: &root,
                home: &home,
            },
            scope,
            &name,
            &HttpDownloader,
        )
        .await
        .map_err(internal)
    }

    async fn skills_trust(
        &self,
        workspace_id: WorkspaceId,
        scope: Scope,
        name: String,
    ) -> Result<SkillInfo, ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        let store = self.sync_store()?;
        let home = self.sync_home();
        skills::trust(
            store,
            SkillHome {
                root: &root,
                home: &home,
            },
            scope,
            &name,
        )
        .await
        .map_err(internal)
    }

    async fn skills_enable(
        &self,
        workspace_id: WorkspaceId,
        scope: Scope,
        name: String,
        enabled: bool,
    ) -> Result<SkillInfo, ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        let store = self.sync_store()?;
        let home = self.sync_home();
        skills::set_enabled(
            store,
            SkillHome {
                root: &root,
                home: &home,
            },
            scope,
            &name,
            enabled,
        )
        .await
        .map_err(internal)
    }
}

fn internal(error: SyncError) -> ApiError {
    ApiError::Internal(error.to_string())
}
