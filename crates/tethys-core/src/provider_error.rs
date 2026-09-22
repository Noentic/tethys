use tethys_agent_servers::StoreError;
use tethys_api::{ApiError, FailureStage};
use tethys_thread::ConnectionError;

use crate::health::HealthRegistry;

pub(crate) fn map_connection(
    health: &HealthRegistry,
    profile_id: &str,
    error: ConnectionError,
) -> ApiError {
    match error {
        ConnectionError::AuthRequired => {
            health.mark_auth_required(profile_id);
            ApiError::AuthRequired("authentication required".into())
        }
        ConnectionError::Unsupported(capability) => ApiError::Failure {
            stage: FailureStage::Unsupported,
            message: capability.to_string(),
        },
        ConnectionError::Transport(message) => ApiError::Failure {
            stage: FailureStage::Transport,
            message,
        },
        ConnectionError::Protocol(message) => ApiError::Failure {
            stage: FailureStage::Initialize,
            message,
        },
        ConnectionError::SessionNotFound(id) => {
            ApiError::NotFound(format!("provider session {id}"))
        }
        ConnectionError::Cancelled => ApiError::Failure {
            stage: FailureStage::ProviderRejected,
            message: "cancelled".into(),
        },
    }
}

pub(crate) fn map_store(health: &HealthRegistry, profile_id: &str, error: StoreError) -> ApiError {
    match error {
        StoreError::AuthRequired => {
            health.mark_auth_required(profile_id);
            ApiError::AuthRequired("authentication required".into())
        }
        StoreError::Spawn(message) => ApiError::Failure {
            stage: FailureStage::Spawn,
            message,
        },
        StoreError::Connect(message) => ApiError::Failure {
            stage: FailureStage::Initialize,
            message,
        },
        StoreError::Recovery(message) => ApiError::Failure {
            stage: FailureStage::SessionSetup,
            message,
        },
        StoreError::UnknownProfile(id) => ApiError::NotFound(format!("agent profile {id}")),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tethys_agent_servers::{ConnectionStore, StoreOptions};
    use tethys_schema::agents::{AuthState, ProviderHealth};
    use tethys_schema::connection::AcpProtocol;

    use super::*;

    #[test]
    fn auth_errors_share_the_profile_health_transition() {
        let health = HealthRegistry::new(ConnectionStore::new(StoreOptions::new(
            AcpProtocol::V1,
            Arc::new(crate::permission::DenyPermissionResolver),
        )));

        assert!(matches!(
            map_connection(&health, "provider", ConnectionError::AuthRequired),
            ApiError::AuthRequired(_)
        ));
        assert_eq!(
            health.record("provider").health,
            ProviderHealth::AuthRequired
        );

        assert!(matches!(
            map_store(&health, "provider", StoreError::AuthRequired),
            ApiError::AuthRequired(_)
        ));
        assert_eq!(health.record("provider").auth_state, AuthState::Required);
    }
}
