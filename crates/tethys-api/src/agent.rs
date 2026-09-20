//! `agent.*` namespace (`architecture.md` §12.1).

use tethys_schema::connection::ConnectionEntry;

use crate::ApiError;

/// Agent profile, registry, connection and config methods.
pub trait AgentApi: Send + Sync {
    fn agent_profiles_list(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.profiles_list")) }
    }

    fn agent_profiles_create(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.profiles_create")) }
    }

    fn agent_profiles_update(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.profiles_update")) }
    }

    fn agent_profiles_delete(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.profiles_delete")) }
    }

    fn agent_registry_list(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.registry_list")) }
    }

    fn agent_registry_install(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.registry_install")) }
    }

    fn agent_registry_update(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.registry_update")) }
    }

    fn agent_connections_list(
        &self,
    ) -> impl std::future::Future<Output = Result<Vec<ConnectionEntry>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.connections_list")) }
    }

    fn agent_connections_restart(
        &self,
        _profile_id: String,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.connections_restart")) }
    }

    fn agent_login(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.login")) }
    }

    fn agent_logout(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.logout")) }
    }

    fn agent_stderr(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.stderr")) }
    }

    fn agent_config_schema(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.config_schema")) }
    }

    fn agent_config_get(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.config_get")) }
    }

    fn agent_config_validate(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.config_validate")) }
    }

    fn agent_config_plan(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.config_plan")) }
    }

    fn agent_config_apply(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.config_apply")) }
    }

    fn agent_config_rollback(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.config_rollback")) }
    }
}
