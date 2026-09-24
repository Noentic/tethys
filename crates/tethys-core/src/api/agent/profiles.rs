use super::*;

impl Core {
    pub(super) async fn profile_rows(&self) -> Result<Vec<AgentProfileRow>, ApiError> {
        match self.sync_store() {
            Ok(store) => {
                let mut rows = store.agent_profiles().await.map_err(map_store)?;
                for row in &mut rows {
                    if row.integration_id.is_none() {
                        if let Some(integration_id) = profile::integration_id_from_row(row)? {
                            row.integration_id = Some(integration_id);
                            store
                                .update_agent_profile(row.clone())
                                .await
                                .map_err(map_store)?;
                        }
                    }
                }
                Ok(rows)
            }
            Err(_) => Ok(Vec::new()),
        }
    }

    /// A launch spec just changed: retire an unused connection so the check that
    /// follows spawns with the new spec instead of reusing the old process. A
    /// connection in use keeps running until it is restarted.
    pub(super) async fn recheck_with_current_spec(&self, profile_id: &str) {
        if let Some(key) = self.sessions.connection_key(profile_id) {
            self.sessions.store().retire_idle(&key).await;
            self.sessions.health().recheck(&key).await;
        }
    }

    pub(super) fn register_row(&self, row: &AgentProfileRow) {
        let Ok(input) = profile::input_from_row(row) else {
            return;
        };
        let integration_id = profile::integration_id_from_row(row).ok().flatten();
        let spec = profile::spec_from_input(&row.id, &input, integration_id.as_deref());
        let compat = profile::compat_from_row(row);
        self.sessions.register_profile(spec, compat);
        self.sessions.set_profile_enabled(&row.id, row.enabled);
    }

    pub(super) fn view_from_row(
        &self,
        row: &AgentProfileRow,
    ) -> Result<AgentProfileView, ApiError> {
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
            integration_id: profile::integration_id_from_row(row)?,
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
            auth_state: record.auth_state,
            provider_auth_status: self
                .sessions
                .connection_key(&row.id)
                .and_then(|key| self.sessions.store().provider_auth_status(&key)),
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
