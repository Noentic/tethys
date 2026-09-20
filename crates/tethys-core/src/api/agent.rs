//! `agent.*` implementations (M1.12/M1.13).

use tethys_agent_servers::registry::{
    compliance_note, install, update_availability, InstallOptions, InstallOutcome,
};
use tethys_api::{AgentApi, ApiError};
use tethys_schema::agents::{
    AgentProfileView, AgentRegistryEntryView, BackendClass, EnvVarInput, InstallResult,
    ProcessSample, ProfileInput, RecheckStatus,
};
use tethys_schema::connection::ConnectionEntry;
use tethys_store::{AgentProfileRow, StoreError};
use tethys_thread::AgentConnection;

use std::sync::Arc;

use crate::agent_profile as profile;
use crate::env_secrets;
use crate::Core;

impl AgentApi for Core {
    async fn agent_profiles_list(&self) -> Result<Vec<AgentProfileView>, ApiError> {
        let rows = self.profile_rows().await?;
        rows.iter().map(|row| self.view_from_row(row)).collect()
    }

    async fn agent_profiles_create(
        &self,
        input: ProfileInput,
    ) -> Result<AgentProfileView, ApiError> {
        let id = input
            .id
            .clone()
            .unwrap_or_else(|| profile::generated_id(&input.name));
        let row = profile::row_from_input(profile::ProfileDraft {
            id,
            name: &input.name,
            class: BackendClass::Manual,
            launch_spec: &input.launch_spec,
            registry_ref: None,
            projection_target: input.projection_target,
            preferred_protocol: input.preferred_protocol,
            enabled: input.enabled,
        })?;
        self.sync_store()?
            .insert_agent_profile(row.clone())
            .await
            .map_err(map_store)?;
        self.register_row(&row);
        self.sessions.health().recheck_all().await;
        self.view_from_row(&row)
    }

    async fn agent_profiles_update(
        &self,
        input: ProfileInput,
    ) -> Result<AgentProfileView, ApiError> {
        let id = input
            .id
            .clone()
            .ok_or_else(|| ApiError::InvalidConfig("profile id is required".into()))?;
        let store = self.sync_store()?;
        let mut row = store
            .agent_profile(&id)
            .await
            .map_err(map_store)?
            .ok_or_else(|| ApiError::NotFound(format!("agent profile {id}")))?;
        profile::apply_input(&mut row, &input)?;
        store
            .update_agent_profile(row.clone())
            .await
            .map_err(map_store)?;
        self.register_row(&row);
        // Executable-path edit and runtime toggle-on are re-check triggers.
        self.recheck_with_current_spec(&id).await;
        self.view_from_row(&row)
    }

    async fn agent_profiles_delete(&self, id: String) -> Result<(), ApiError> {
        let store = self.sync_store()?;
        let owned = match store.agent_profile(&id).await.map_err(map_store)? {
            Some(row) => {
                let input = profile::input_from_row(&row)?;
                env_secrets::owned_accounts(
                    &id,
                    input.env.iter().map(|binding| binding.value.as_str()),
                )
            }
            None => Vec::new(),
        };
        store.delete_agent_profile(&id).await.map_err(map_store)?;
        self.sessions.unregister_profile(&id);

        // The profile's keychain secrets go with it. A failure here leaves an
        // orphaned entry, which is worse to hide than to report but not worth
        // failing a delete that has already happened.
        let secrets = Arc::clone(&self.sessions.sync().secrets);
        let cleanup = tokio::task::spawn_blocking(move || {
            for account in owned {
                if let Err(error) = secrets.delete(&account) {
                    tracing::warn!(%account, %error, "could not delete a profile secret");
                }
            }
        });
        cleanup
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;
        Ok(())
    }

    async fn agent_registry_list(&self) -> Result<Vec<AgentRegistryEntryView>, ApiError> {
        let registry = self.registry().await?;
        let rows = self.profile_rows().await?;
        let mut views = Vec::with_capacity(registry.agents.len());
        for agent in &registry.agents {
            let stored = rows.iter().find(|row| row.id == agent.id);
            let pinned = stored
                .and_then(|row| profile::registry_ref_from_row(row).ok().flatten())
                .map(|reference| reference.version);
            let update = pinned
                .as_deref()
                .map(|pinned| update_availability(pinned, &agent.version));
            views.push(AgentRegistryEntryView {
                id: agent.id.clone(),
                name: agent.name.clone(),
                version: agent.version.clone(),
                description: agent.description.clone(),
                repository: agent.repository.clone(),
                license: agent.license.clone(),
                distributions: vec![agent.distribution.kind().to_string()],
                installed: stored.is_some(),
                pinned_version: pinned,
                update,
                compliance_note: compliance_note(&agent.id).map(str::to_string),
            });
        }
        Ok(views)
    }

    async fn agent_registry_install(
        &self,
        id: String,
        version: Option<String>,
    ) -> Result<InstallResult, ApiError> {
        let registry = self.registry().await?;
        let agent = registry
            .agent(&id)
            .cloned()
            .ok_or_else(|| ApiError::NotFound(format!("registry agent {id}")))?;
        let options = InstallOptions {
            install_root: self.install_root(),
            platform: None,
            node_present: None,
        };
        let outcome = install(&agent, version.as_deref(), &options)
            .await
            .map_err(map_registry)?;
        self.persist_install(&outcome, None, None).await
    }

    async fn agent_registry_update(&self, id: String) -> Result<InstallResult, ApiError> {
        let registry = self.registry().await?;
        let agent = registry
            .agent(&id)
            .cloned()
            .ok_or_else(|| ApiError::NotFound(format!("registry agent {id}")))?;
        let existing = self
            .sync_store()?
            .agent_profile(&id)
            .await
            .map_err(map_store)?;
        let projection = existing
            .as_ref()
            .and_then(|row| row.projection_target.as_deref())
            .and_then(tethys_schema::sync::ProjectionTarget::parse);
        let preferred = existing
            .as_ref()
            .and_then(|row| row.preferred_protocol.as_deref())
            .and_then(|value| match value {
                "V1" => Some(tethys_schema::connection::AcpProtocol::V1),
                "V2" => Some(tethys_schema::connection::AcpProtocol::V2),
                _ => None,
            });
        let options = InstallOptions {
            install_root: self.install_root(),
            platform: None,
            node_present: None,
        };
        let outcome = install(&agent, None, &options)
            .await
            .map_err(map_registry)?;
        self.persist_install(&outcome, projection, preferred).await
    }

    async fn agent_connections_list(&self) -> Result<Vec<ConnectionEntry>, ApiError> {
        Ok(self.sessions.connections())
    }

    async fn agent_connections_restart(&self, profile_id: String) -> Result<(), ApiError> {
        self.sessions.restart_connection(&profile_id).await?;
        if let Some(key) = self.sessions.connection_key(&profile_id) {
            self.sessions.health().recheck(&key).await;
        }
        Ok(())
    }

    async fn agent_login(&self, profile_id: String, method_id: String) -> Result<(), ApiError> {
        let key = self
            .sessions
            .connection_key(&profile_id)
            .ok_or_else(|| ApiError::NotFound(format!("agent profile {profile_id}")))?;
        // Best-effort vendor handshake. `Unsupported` is fine: terminal and
        // agent-auth flows are owned by the vendor, and Tethys never holds the
        // credential (G7).
        if let Ok(lease) = self.sessions.store().acquire(&key).await {
            let _ = lease.connection().login(&method_id).await;
        }
        self.sessions.health().mark_authenticated(&profile_id);
        self.sessions.health().recheck(&key).await;
        Ok(())
    }

    async fn agent_logout(&self, _profile_id: String) -> Result<(), ApiError> {
        // Logout is delegated to the vendor CLI; no credential is held here.
        Ok(())
    }

    async fn agent_stderr(&self, profile_id: String) -> Result<String, ApiError> {
        let key = self
            .sessions
            .connection_key(&profile_id)
            .ok_or_else(|| ApiError::NotFound(format!("agent profile {profile_id}")))?;
        Ok(self.sessions.store().stderr(&key))
    }

    async fn agent_env_secret_set(
        &self,
        profile_id: String,
        key: String,
        value: String,
    ) -> Result<AgentProfileView, ApiError> {
        if !env_secrets::is_env_name(&key) {
            return Err(ApiError::InvalidConfig(format!(
                "{key:?} is not a valid environment variable name"
            )));
        }
        if value.is_empty() {
            return Err(ApiError::InvalidConfig("a secret value is required".into()));
        }
        let store = self.sync_store()?;
        let mut row = store
            .agent_profile(&profile_id)
            .await
            .map_err(map_store)?
            .ok_or_else(|| ApiError::NotFound(format!("agent profile {profile_id}")))?;

        // The value goes to the keychain and nowhere else; the row keeps the ref.
        let secrets = Arc::clone(&self.sessions.sync().secrets);
        let account = env_secrets::secret_account(&profile_id, &key);
        tokio::task::spawn_blocking(move || secrets.set(&account, &value))
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?
            .map_err(|error| ApiError::Internal(error.to_string()))?;

        let mut input = profile::input_from_row(&row)?;
        let reference = env_secrets::secret_ref(&profile_id, &key);
        match input.env.iter_mut().find(|binding| binding.key == key) {
            Some(binding) => binding.value = reference,
            None => input.env.push(EnvVarInput {
                key,
                value: reference,
            }),
        }
        row.launch_spec =
            serde_json::to_string(&input).map_err(|error| ApiError::Internal(error.to_string()))?;
        store
            .update_agent_profile(row.clone())
            .await
            .map_err(map_store)?;
        self.register_row(&row);
        self.recheck_with_current_spec(&profile_id).await;
        self.view_from_row(&row)
    }

    async fn agent_process_sample(
        &self,
        profile_id: String,
    ) -> Result<Vec<ProcessSample>, ApiError> {
        let key = self
            .sessions
            .connection_key(&profile_id)
            .ok_or_else(|| ApiError::NotFound(format!("agent profile {profile_id}")))?;
        let Some(entry) = self.sessions.store().entry(&key) else {
            return Ok(Vec::new());
        };
        let Some(pid) = entry.pid else {
            return Ok(Vec::new());
        };
        Ok(self.monitor.sample(pid))
    }

    async fn agent_health_interval_set(&self, seconds: u32) -> Result<(), ApiError> {
        self.sessions.health().set_interval(seconds as u64);
        Ok(())
    }

    async fn agent_recheck(&self, profile_id: Option<String>) -> Result<(), ApiError> {
        match profile_id {
            Some(profile_id) => {
                let key = self
                    .sessions
                    .connection_key(&profile_id)
                    .ok_or_else(|| ApiError::NotFound(format!("agent profile {profile_id}")))?;
                self.sessions.health().recheck(&key).await;
                Ok(())
            }
            None => {
                self.sessions.health().recheck_all().await;
                Ok(())
            }
        }
    }
}

impl Core {
    async fn profile_rows(&self) -> Result<Vec<AgentProfileRow>, ApiError> {
        match self.sync_store() {
            Ok(store) => store.agent_profiles().await.map_err(map_store),
            Err(_) => Ok(Vec::new()),
        }
    }

    async fn registry(&self) -> Result<tethys_agent_servers::registry::Registry, ApiError> {
        let source = self.registry_source()?;
        source.fetch().await.map_err(map_registry)
    }

    /// Persists an install outcome and refreshes the hot cache + health.
    async fn persist_install(
        &self,
        outcome: &InstallOutcome,
        projection_target: Option<tethys_schema::sync::ProjectionTarget>,
        preferred_protocol: Option<tethys_schema::connection::AcpProtocol>,
    ) -> Result<InstallResult, ApiError> {
        let row = profile::row_from_input(profile::ProfileDraft {
            id: outcome.profile_id.clone(),
            name: &outcome.name,
            class: BackendClass::Registry,
            launch_spec: &outcome.launch_spec,
            registry_ref: Some(&outcome.registry_ref),
            projection_target,
            preferred_protocol,
            enabled: true,
        })?;
        self.sync_store()?
            .upsert_agent_profile(row.clone())
            .await
            .map_err(map_store)?;
        self.register_row(&row);
        self.recheck_with_current_spec(&outcome.profile_id).await;
        Ok(InstallResult {
            profile_id: outcome.profile_id.clone(),
            version: outcome.registry_ref.version.clone(),
            launch_spec: outcome.launch_spec.clone(),
            warning: outcome.warning.clone(),
            needs_node: outcome.needs_node,
        })
    }

    /// A launch spec just changed: retire an unused connection so the check that
    /// follows spawns with the new spec instead of reusing the old process. A
    /// connection in use keeps running until it is restarted.
    async fn recheck_with_current_spec(&self, profile_id: &str) {
        if let Some(key) = self.sessions.connection_key(profile_id) {
            self.sessions.store().retire_idle(&key).await;
            self.sessions.health().recheck(&key).await;
        }
    }

    fn register_row(&self, row: &AgentProfileRow) {
        let Ok(input) = profile::input_from_row(row) else {
            return;
        };
        let spec = profile::spec_from_input(&row.id, &input);
        let compat = profile::compat_from_row(row);
        self.sessions.register_profile(spec, compat);
        self.sessions.set_profile_enabled(&row.id, row.enabled);
    }

    fn view_from_row(&self, row: &AgentProfileRow) -> Result<AgentProfileView, ApiError> {
        let record = self.sessions.health().record(&row.id);
        let input = profile::input_from_row(row)?;
        let registry_ref = profile::registry_ref_from_row(row)?;
        let (health, detail) = if !row.enabled {
            (
                record.health,
                Some("Disabled in Tethys settings".to_string()),
            )
        } else {
            (record.health, record.detail.clone())
        };
        Ok(AgentProfileView {
            id: row.id.clone(),
            name: row.name.clone(),
            class: profile::class_from_row(row),
            enabled: row.enabled,
            launch_spec: input,
            registry_ref,
            projection_target: row
                .projection_target
                .as_deref()
                .and_then(tethys_schema::sync::ProjectionTarget::parse),
            preferred_protocol: profile::compat_from_row(row).preferred_protocol,
            health,
            detail,
            protocol: record.protocol,
            capabilities: record.capabilities,
            auth_methods: record.auth_methods,
            detected_version: record.detected_version,
            latency_ms: record.latency_ms,
            last_checked_ms: record.last_checked_ms,
            recheck: if record.recheck == RecheckStatus::Checking {
                RecheckStatus::Checking
            } else {
                RecheckStatus::Idle
            },
        })
    }
}

fn map_store(error: StoreError) -> ApiError {
    match error {
        StoreError::Conflict(message) => ApiError::Conflict(message),
        StoreError::NotFound(message) => ApiError::NotFound(message),
        other => ApiError::Internal(other.to_string()),
    }
}

fn map_registry(error: tethys_agent_servers::registry::RegistryError) -> ApiError {
    ApiError::Internal(error.to_string())
}
