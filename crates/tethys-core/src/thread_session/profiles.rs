use super::*;

impl ThreadSessions {
    /// Registers a launchable profile. M1.12 replaces this with the profile store.
    pub fn register_profile(&self, spec: LaunchSpec, compat: AgentCompat) -> String {
        let profile_id = spec.profile_id.clone();
        let key = self.store.register(spec, compat.clone());
        self.profiles
            .lock()
            .insert(profile_id.clone(), (key, compat));
        self.refresh_health_enabled();
        profile_id
    }

    /// Removes a profile from the hot cache (`agent.profiles_delete`).
    pub fn unregister_profile(&self, profile_id: &str) -> bool {
        let removed = self.profiles.lock().remove(profile_id).is_some();
        self.refresh_health_enabled();
        removed
    }

    /// The health registry shared with the `agent.*` namespace.
    pub fn health(&self) -> &Arc<HealthRegistry> {
        &self.health
    }

    /// The store key for a registered profile, if any.
    pub fn connection_key(&self, profile_id: &str) -> Option<ConnectionKey> {
        self.profiles
            .lock()
            .get(profile_id)
            .map(|(key, _)| key.clone())
    }

    /// Hydrates the in-memory profile cache from persisted rows at `Core::open`.
    pub fn hydrate_profiles(&self, rows: &[tethys_store::AgentProfileRow]) {
        for row in rows {
            let Ok(input) = crate::agent_profile::input_from_row(row) else {
                continue;
            };
            let integration_id = crate::agent_profile::registry_ref_from_row(row)
                .ok()
                .flatten()
                .map(|reference| reference.id);
            let spec =
                crate::agent_profile::spec_from_input(&row.id, &input, integration_id.as_deref());
            let compat = crate::agent_profile::compat_from_row(row);
            self.register_profile(spec, compat);
            self.set_profile_enabled(&row.id, row.enabled);
        }
    }

    /// Records whether the user has this profile switched on. A disabled
    /// profile stays registered but is never spawned by a health sweep.
    pub fn set_profile_enabled(&self, profile_id: &str, enabled: bool) {
        {
            let mut disabled = self.disabled.lock();
            if enabled {
                disabled.remove(profile_id);
            } else {
                disabled.insert(profile_id.to_string());
            }
        }
        self.refresh_health_enabled();
    }

    pub(super) fn refresh_health_enabled(&self) {
        let disabled = self.disabled.lock();
        let keys = self
            .profiles
            .lock()
            .iter()
            .filter(|(id, _)| !disabled.contains(*id))
            .map(|(_, (key, _))| key.clone())
            .collect();
        self.health.set_enabled(keys);
    }

    pub fn profiles_compat(&self) -> Vec<(String, ConnectionKey, AgentCompat)> {
        let guard = self.profiles.lock();
        let mut list: Vec<_> = guard
            .iter()
            .map(|(id, (key, compat))| (id.clone(), key.clone(), compat.clone()))
            .collect();
        list.sort_by(|a, b| a.0.cmp(&b.0));
        list
    }

    pub(super) fn profile_key(&self, profile_id: &str) -> Result<ConnectionKey, ApiError> {
        self.profiles
            .lock()
            .get(profile_id)
            .map(|(key, _)| key.clone())
            .ok_or_else(|| ApiError::NotFound(format!("agent profile {profile_id}")))
    }
}
