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
        let existing = self.profile_rows().await?.into_iter().find(|row| {
            profile::integration_id_from_row(row)
                .ok()
                .flatten()
                .as_deref()
                == Some(outcome.registry_ref.id.as_str())
        });
        let profile_id = existing
            .as_ref()
            .map_or_else(|| outcome.profile_id.clone(), |row| row.id.clone());
        let name = existing
            .as_ref()
            .map_or(outcome.name.as_str(), |row| row.name.as_str());
        let enabled = existing.as_ref().map_or(true, |row| row.enabled);
        let compat = existing.as_ref().map(profile::compat_from_row);
        let mut launch_spec = outcome.launch_spec.clone();
        if let Some(existing) = &existing {
            let previous = profile::input_from_row(existing)?;
            launch_spec.cwd = previous.cwd;
            launch_spec.env = previous.env;
        }
        let row = profile::row_from_input(profile::ProfileDraft {
            id: profile_id.clone(),
            name,
            class: BackendClass::Registry,
            launch_spec: &launch_spec,
            registry_ref: Some(&outcome.registry_ref),
            integration_id: Some(&outcome.registry_ref.id),
            projection_target: projection_target.or_else(|| {
                compat
                    .as_ref()
                    .and_then(|compat| compat.projection_target.clone())
            }),
            preferred_protocol: preferred_protocol
                .or_else(|| compat.as_ref().and_then(|compat| compat.preferred_protocol)),
            enabled,
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

pub(super) fn ensure_registry_install_allowed(id: &str) -> Result<(), ApiError> {
    if compliance_note(id).is_some() {
        return Err(ApiError::Failure {
            stage: FailureStage::Unsupported,
            message: format!("Registry setup for {id} is blocked by compliance review"),
        });
    }
    Ok(())
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
