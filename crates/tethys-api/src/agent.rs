//! `agent.*` namespace (`architecture.md` §12.1).

use tethys_schema::agents::{
    AgentProfileView, InstallResult, ProcessSample, ProfileInput, AgentRegistryEntryView,
};
use tethys_schema::connection::ConnectionEntry;

use crate::ApiError;

/// Agent profile, registry, connection, health, monitoring and config methods.
///
/// M1.12/M1.13 override profiles, registry, login/stderr, process sampling and
/// the health interval; the `config_*` methods stay M2.5/SYN-11 stubs.
pub trait AgentApi: Send + Sync {
    fn agent_profiles_list(
        &self,
    ) -> impl std::future::Future<Output = Result<Vec<AgentProfileView>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.profiles_list")) }
    }

    fn agent_profiles_create(
        &self,
        _input: ProfileInput,
    ) -> impl std::future::Future<Output = Result<AgentProfileView, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.profiles_create")) }
    }

    fn agent_profiles_update(
        &self,
        _input: ProfileInput,
    ) -> impl std::future::Future<Output = Result<AgentProfileView, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.profiles_update")) }
    }

    fn agent_profiles_delete(
        &self,
        _id: String,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.profiles_delete")) }
    }

    fn agent_registry_list(
        &self,
    ) -> impl std::future::Future<Output = Result<Vec<AgentRegistryEntryView>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.registry_list")) }
    }

    fn agent_registry_install(
        &self,
        _id: String,
        _version: Option<String>,
    ) -> impl std::future::Future<Output = Result<InstallResult, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.registry_install")) }
    }

    fn agent_registry_update(
        &self,
        _id: String,
    ) -> impl std::future::Future<Output = Result<InstallResult, ApiError>> + Send {
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

    fn agent_login(
        &self,
        _profile_id: String,
        _method_id: String,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.login")) }
    }

    fn agent_logout(
        &self,
        _profile_id: String,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.logout")) }
    }

    fn agent_stderr(
        &self,
        _profile_id: String,
    ) -> impl std::future::Future<Output = Result<String, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.stderr")) }
    }

    /// Stores an environment secret for a profile (`agent.env_secret_set`, M1.12).
    ///
    /// The value goes to the platform keychain; only a `keychain:tethys/…`
    /// reference is written into the profile's launch env, so the profile row
    /// never holds a credential. Write-only: no method reads a secret back
    /// (G7). Returns the updated profile.
    fn agent_env_secret_set(
        &self,
        _profile_id: String,
        _key: String,
        _value: String,
    ) -> impl std::future::Future<Output = Result<AgentProfileView, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.env_secret_set")) }
    }

    /// Per-thread process-tree sample (`agent.process_sample`, M1.13).
    fn agent_process_sample(
        &self,
        _profile_id: String,
    ) -> impl std::future::Future<Output = Result<Vec<ProcessSample>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.process_sample")) }
    }

    /// Arms/disarms the health poller; `0` means manual only (M1.12).
    fn agent_health_interval_set(
        &self,
        _seconds: u32,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.health_interval_set")) }
    }

    /// Re-checks one profile, or every enabled profile when `None`.
    fn agent_recheck(
        &self,
        _profile_id: Option<String>,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.recheck")) }
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
