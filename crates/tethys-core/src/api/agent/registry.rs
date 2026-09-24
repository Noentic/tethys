use super::*;

impl Core {
    pub(super) async fn registry(
        &self,
    ) -> Result<tethys_agent_servers::registry::Registry, ApiError> {
        let source = self.registry_source()?;
        source.fetch().await.map_err(map_registry)
    }

    /// Persists an install outcome and refreshes the hot cache + health.
    pub(super) async fn persist_install(
        &self,
        outcome: &InstallOutcome,
        projection_target: Option<tethys_schema::sync::ProjectionTarget>,
        preferred_protocol: Option<tethys_schema::connection::AcpProtocol>,
    ) -> Result<InstallResult, ApiError> {
        let profile_id = self
            .profile_rows()
            .await?
            .iter()
            .find(|row| {
                profile::integration_id_from_row(row)
                    .ok()
                    .flatten()
                    .as_deref()
                    == Some(outcome.registry_ref.id.as_str())
            })
            .map_or_else(|| outcome.profile_id.clone(), |row| row.id.clone());
        let row = profile::row_from_input(profile::ProfileDraft {
            id: profile_id.clone(),
            name: &outcome.name,
            class: BackendClass::Registry,
            launch_spec: &outcome.launch_spec,
            registry_ref: Some(&outcome.registry_ref),
            integration_id: Some(&outcome.registry_ref.id),
            projection_target,
            preferred_protocol,
            enabled: true,
        })?;
        self.sync_store()?
            .upsert_agent_profile(row.clone())
            .await
            .map_err(map_store)?;
        self.register_row(&row);
        self.recheck_with_current_spec(&profile_id).await;
        Ok(InstallResult {
            profile_id,
            version: outcome.registry_ref.version.clone(),
            distribution: outcome.distribution.clone(),
            selection_reason: outcome.selection_reason.clone(),
            launch_spec: outcome.launch_spec.clone(),
            warning: outcome.warning.clone(),
            needs_node: outcome.needs_node,
            needs_uvx: outcome.needs_uvx,
        })
    }
}

pub(super) fn map_registry(error: tethys_agent_servers::registry::RegistryError) -> ApiError {
    use tethys_agent_servers::registry::RegistryError;
    let stage = match &error {
        RegistryError::Fetch(_) | RegistryError::Malformed(_) => FailureStage::Install,
        RegistryError::UnknownAgent(_) | RegistryError::VersionUnavailable { .. } => {
            FailureStage::ProviderRejected
        }
        RegistryError::UnsupportedDistribution(_) | RegistryError::UnsupportedPlatform(_) => {
            FailureStage::Unsupported
        }
        RegistryError::Integrity { .. } | RegistryError::Install(_) => FailureStage::Install,
    };
    ApiError::Failure {
        stage,
        message: error.to_string(),
    }
}
