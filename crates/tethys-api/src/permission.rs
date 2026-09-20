//! `permission.*` namespace (`architecture.md` §12.1).

use crate::ApiError;

/// Permission response and rule methods.
pub trait PermissionApi: Send + Sync {
    fn permission_respond(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("permission.respond")) }
    }

    fn permission_rules_list(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("permission.rules_list")) }
    }

    fn permission_rules_set(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("permission.rules_set")) }
    }

    fn permission_rules_delete(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("permission.rules_delete")) }
    }
}
