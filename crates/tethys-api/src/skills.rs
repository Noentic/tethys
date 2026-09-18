//! `skills.*` namespace (`architecture.md` §12.1).

use tethys_schema::sync::{
    Scope, SkillImportSource, SkillInfo, SkillUpdateApplied, SkillUpdateCheck, SkillUpdatePlan,
};

use crate::ApiError;

/// Skill library methods.
pub trait SkillsApi: Send + Sync {
    fn skills_list(
        &self,
        _project_root: String,
    ) -> impl std::future::Future<Output = Result<Vec<SkillInfo>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("skills.list")) }
    }

    fn skills_import(
        &self,
        _project_root: String,
        _scope: Scope,
        _source: SkillImportSource,
    ) -> impl std::future::Future<Output = Result<SkillInfo, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("skills.import")) }
    }

    fn skills_update_check(
        &self,
        _project_root: String,
        _scope: Scope,
        _name: String,
    ) -> impl std::future::Future<Output = Result<SkillUpdateCheck, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("skills.update_check")) }
    }

    fn skills_update_plan(
        &self,
        _project_root: String,
        _scope: Scope,
        _name: String,
    ) -> impl std::future::Future<Output = Result<SkillUpdatePlan, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("skills.update_plan")) }
    }

    fn skills_update_apply(
        &self,
        _project_root: String,
        _scope: Scope,
        _name: String,
    ) -> impl std::future::Future<Output = Result<SkillUpdateApplied, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("skills.update_apply")) }
    }

    fn skills_trust(
        &self,
        _project_root: String,
        _scope: Scope,
        _name: String,
    ) -> impl std::future::Future<Output = Result<SkillInfo, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("skills.trust")) }
    }

    fn skills_enable(
        &self,
        _project_root: String,
        _scope: Scope,
        _name: String,
        _enabled: bool,
    ) -> impl std::future::Future<Output = Result<SkillInfo, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("skills.enable")) }
    }
}
