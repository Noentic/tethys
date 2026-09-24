//! `agent.*` implementations (M1.12/M1.13).

use tethys_agent_servers::registry::{
    compliance_note, install, select_distribution, update_availability, InstallOptions,
    InstallOutcome,
};
use tethys_api::{AgentApi, ApiError, FailureStage};
use tethys_schema::agents::{
    AgentLoginInput, AgentLoginOutcome, AgentProfileView, AgentRegistryEntryView, AuthMethodShape,
    BackendClass, EnvVarInput, InstallResult, LoginTerminalOutput, ProcessSample, ProfileInput,
    RecheckStatus,
};
use tethys_schema::connection::ConnectionEntry;
use tethys_store::{AgentProfileRow, StoreError};
use tethys_thread::AgentConnection;

use crate::provider_error::{map_connection, map_store as map_connection_store};

use std::sync::Arc;

use crate::agent_profile as profile;
use crate::env_secrets;
use crate::Core;

mod auth;
mod profiles;
mod registry;

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
            integration_id: None,
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
        let platform_key = tethys_agent_servers::registry::platform::host_platform_key();
        let node_present = which::which("npx").is_ok();
        let uv_present = which::which("uvx").is_ok();
        let mut views = Vec::with_capacity(registry.agents.len());
        for agent in &registry.agents {
            let stored = rows.iter().find(|row| {
                row.id == agent.id
                    || profile::integration_id_from_row(row)
                        .ok()
                        .flatten()
                        .as_deref()
                        == Some(agent.id.as_str())
            });
            let pinned = stored
                .and_then(|row| profile::registry_ref_from_row(row).ok().flatten())
                .map(|reference| reference.version);
            let update = pinned
                .as_deref()
                .map(|pinned| update_availability(pinned, &agent.version));
            let (
                selected_distribution,
                needs_node,
                needs_uvx,
                selection_reason,
                install_block_reason,
            ) = match select_distribution(
                &agent.distribution,
                platform_key,
                node_present,
                uv_present,
            ) {
                Ok(selection) => (
                    Some(selection.kind),
                    selection.needs_node,
                    selection.needs_uvx,
                    selection.reason,
                    None,
                ),
                Err(error) => (None, false, false, None, Some(error.to_string())),
            };
            views.push(AgentRegistryEntryView {
                id: agent.id.clone(),
                name: agent.name.clone(),
                version: agent.version.clone(),
                description: agent.description.clone(),
                repository: agent.repository.clone(),
                authors: agent.authors.clone(),
                license: agent.license.clone(),
                license_url: agent.license_url.clone(),
                website: agent.website.clone(),
                icon: agent.icon.clone(),
                preview_version: agent
                    .preview
                    .as_ref()
                    .map(|preview| preview.version.clone()),
                distributions: agent
                    .distribution
                    .kinds()
                    .into_iter()
                    .map(str::to_string)
                    .collect(),
                selected_distribution,
                needs_node,
                needs_uvx,
                selection_reason,
                install_block_reason,
                installed: stored.is_some(),
                system_available: agent.id == tethys_agent_servers::providers::codex::REGISTRY_ID
                    && tethys_agent_servers::providers::codex::system_launch_spec().is_some(),
                setup_note: (agent.id == tethys_agent_servers::providers::codex::REGISTRY_ID)
                    .then(tethys_agent_servers::providers::codex::setup_note)
                    .flatten(),
                pinned_version: pinned,
                update,
                compliance_note: compliance_note(&agent.id).map(str::to_string),
            });
        }
        Ok(views)
    }

    async fn agent_registry_use_system(&self, id: String) -> Result<AgentProfileView, ApiError> {
        let detected = if id == tethys_agent_servers::providers::codex::REGISTRY_ID {
            tethys_agent_servers::providers::codex::system_launch_spec()
        } else {
            None
        }
        .ok_or_else(|| ApiError::NotFound(format!("system ACP server {id}")))?;
        let rows = self.profile_rows().await?;
        let existing = rows.iter().find(|row| {
            profile::integration_id_from_row(row)
                .ok()
                .flatten()
                .as_deref()
                == Some(id.as_str())
        });

        let profile_id = existing.map_or_else(
            || {
                if rows.iter().any(|row| row.id == id) {
                    format!("system-{id}")
                } else {
                    id.clone()
                }
            },
            |row| row.id.clone(),
        );
        let row = if let Some(existing) = existing {
            profile::system_profile_from_existing(existing, &id, detected)?
        } else {
            let launch_spec = profile::launch_spec_for_system(None, detected);
            profile::row_from_input(profile::ProfileDraft {
                id: profile_id.clone(),
                name: "Codex",
                class: BackendClass::Manual,
                launch_spec: &launch_spec,
                registry_ref: None,
                integration_id: Some(&id),
                projection_target: None,
                preferred_protocol: None,
                enabled: true,
            })?
        };
        self.sync_store()?
            .upsert_agent_profile(row.clone())
            .await
            .map_err(map_store)?;
        self.register_row(&row);
        self.recheck_with_current_spec(&profile_id).await;
        self.view_from_row(&row)
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
            uv_present: None,
        };
        let outcome = install(&agent, version.as_deref(), &options)
            .await
            .map_err(registry::map_registry)?;
        self.persist_install(&outcome, None, None).await
    }

    async fn agent_registry_update(&self, id: String) -> Result<InstallResult, ApiError> {
        let registry = self.registry().await?;
        let agent = registry
            .agent(&id)
            .cloned()
            .ok_or_else(|| ApiError::NotFound(format!("registry agent {id}")))?;
        let rows = self.profile_rows().await?;
        let existing = rows.iter().find(|row| {
            row.id == id
                || profile::integration_id_from_row(row)
                    .ok()
                    .flatten()
                    .as_deref()
                    == Some(id.as_str())
        });
        let projection = existing
            .and_then(|row| row.projection_target.as_deref())
            .and_then(tethys_schema::sync::ProjectionTarget::parse);
        let preferred = existing
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
            uv_present: None,
        };
        let outcome = install(&agent, None, &options)
            .await
            .map_err(registry::map_registry)?;
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

    async fn agent_login(
        &self,
        profile_id: String,
        method_id: String,
        input: Option<AgentLoginInput>,
    ) -> Result<AgentLoginOutcome, ApiError> {
        let key = self
            .sessions
            .connection_key(&profile_id)
            .ok_or_else(|| ApiError::NotFound(format!("agent profile {profile_id}")))?;
        let lease =
            self.sessions.store().acquire(&key).await.map_err(|error| {
                map_connection_store(self.sessions.health(), &profile_id, error)
            })?;
        let method = lease
            .connection()
            .auth_methods()
            .iter()
            .find(|method| method.id == method_id)
            .ok_or_else(|| ApiError::InvalidConfig(format!("unknown auth method {method_id}")))?;
        if matches!(&method.shape, AuthMethodShape::CliPassthrough) {
            drop(lease);
            let terminal_id = self
                .sessions
                .store()
                .start_terminal_auth(&key, &method_id)
                .await
                .map_err(|error| {
                    map_connection_store(self.sessions.health(), &profile_id, error)
                })?;
            return Ok(AgentLoginOutcome::Terminal { terminal_id });
        }
        if matches!(&method.shape, AuthMethodShape::Unknown { .. }) {
            return Err(ApiError::InvalidConfig(format!(
                "unsupported auth method {method_id}"
            )));
        }
        let metadata = auth::auth_login_metadata(
            method,
            input,
            lease
                .connection()
                .capabilities()
                .provider_extensions
                .gateway_auth,
        )?;
        lease
            .connection()
            .login(&method_id, metadata)
            .await
            .map_err(|error| map_connection(self.sessions.health(), &profile_id, error))?;
        drop(lease);
        self.sessions.health().mark_authenticated(&profile_id);
        self.sessions.health().recheck(&key).await;
        Ok(AgentLoginOutcome::Complete)
    }

    async fn agent_login_terminal_output(
        &self,
        profile_id: String,
        terminal_id: String,
    ) -> Result<LoginTerminalOutput, ApiError> {
        let key = self
            .sessions
            .connection_key(&profile_id)
            .ok_or_else(|| ApiError::NotFound(format!("agent profile {profile_id}")))?;
        let output = self
            .sessions
            .store()
            .terminal_auth_output(&key, &terminal_id)
            .map_err(|error| map_connection_store(self.sessions.health(), &profile_id, error))?;
        if output.exited {
            let _ = self
                .sessions
                .store()
                .terminal_auth_cancel(&key, &terminal_id);
        }
        Ok(output)
    }

    async fn agent_login_terminal_write(
        &self,
        profile_id: String,
        terminal_id: String,
        text: String,
    ) -> Result<(), ApiError> {
        let key = self
            .sessions
            .connection_key(&profile_id)
            .ok_or_else(|| ApiError::NotFound(format!("agent profile {profile_id}")))?;
        self.sessions
            .store()
            .terminal_auth_write(&key, &terminal_id, &text)
            .map_err(|error| map_connection_store(self.sessions.health(), &profile_id, error))?;
        Ok(())
    }

    async fn agent_login_terminal_cancel(
        &self,
        profile_id: String,
        terminal_id: String,
    ) -> Result<(), ApiError> {
        let key = self
            .sessions
            .connection_key(&profile_id)
            .ok_or_else(|| ApiError::NotFound(format!("agent profile {profile_id}")))?;
        self.sessions
            .store()
            .terminal_auth_cancel(&key, &terminal_id)
            .map_err(|error| map_connection_store(self.sessions.health(), &profile_id, error))?;
        Ok(())
    }

    async fn agent_logout(&self, profile_id: String) -> Result<(), ApiError> {
        let key = self
            .sessions
            .connection_key(&profile_id)
            .ok_or_else(|| ApiError::NotFound(format!("agent profile {profile_id}")))?;
        let lease =
            self.sessions.store().acquire(&key).await.map_err(|error| {
                map_connection_store(self.sessions.health(), &profile_id, error)
            })?;
        if !lease.connection().capabilities().logout {
            return Err(ApiError::Unimplemented("agent.logout"));
        }
        lease
            .connection()
            .logout()
            .await
            .map_err(|error| map_connection(self.sessions.health(), &profile_id, error))?;
        drop(lease);
        self.sessions.health().mark_logged_out(&profile_id);
        self.sessions.store().retire_idle(&key).await;
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

fn map_store(error: StoreError) -> ApiError {
    match error {
        StoreError::Conflict(message) => ApiError::Conflict(message),
        StoreError::NotFound(message) => ApiError::NotFound(message),
        other => ApiError::Internal(other.to_string()),
    }
}
