//! `skills.*` namespace implementation.

use std::fs;
use std::path::{Path, PathBuf};

use tethys_api::{ApiError, SkillsApi};
use tethys_schema::sync::{
    Scope, SkillImportSource, SkillInfo, SkillUpdateApplied, SkillUpdateCheck, SkillUpdatePlan,
};
use tethys_sync::skill_import::{import_folder, import_github, import_zip, HttpDownloader};
use tethys_sync::skills::{self, SkillHome};
use tethys_sync::SyncError;

use crate::Core;

impl SkillsApi for Core {
    async fn skills_list(&self, project_root: String) -> Result<Vec<SkillInfo>, ApiError> {
        let store = self.sync_store()?;
        let home = self.sync_home();
        let root = PathBuf::from(&project_root);
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
        project_root: String,
        scope: Scope,
        source: SkillImportSource,
    ) -> Result<SkillInfo, ApiError> {
        let store = self.sync_store()?;
        let home = self.sync_home();
        let root = PathBuf::from(&project_root);
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
        project_root: String,
        scope: Scope,
        name: String,
    ) -> Result<SkillUpdateCheck, ApiError> {
        let store = self.sync_store()?;
        let home = self.sync_home();
        let root = PathBuf::from(&project_root);
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
        project_root: String,
        scope: Scope,
        name: String,
    ) -> Result<SkillUpdatePlan, ApiError> {
        let store = self.sync_store()?;
        let home = self.sync_home();
        let root = PathBuf::from(&project_root);
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
        project_root: String,
        scope: Scope,
        name: String,
    ) -> Result<SkillUpdateApplied, ApiError> {
        let store = self.sync_store()?;
        let home = self.sync_home();
        let root = PathBuf::from(&project_root);
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
        project_root: String,
        scope: Scope,
        name: String,
    ) -> Result<SkillInfo, ApiError> {
        let store = self.sync_store()?;
        let home = self.sync_home();
        let root = PathBuf::from(&project_root);
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
        project_root: String,
        scope: Scope,
        name: String,
        enabled: bool,
    ) -> Result<SkillInfo, ApiError> {
        let store = self.sync_store()?;
        let home = self.sync_home();
        let root = PathBuf::from(&project_root);
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
