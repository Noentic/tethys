//! Optional Provider-owned ACP extensions. Standard ACP agents need no entry.

use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value};
use tethys_acp::client::AcpProviderIntegration;
use tethys_schema::thread::ConfigOption;

/// The Tethys approval level a Provider mode stands for, when the mode is
/// really a permission preset rather than a way of working (PRM-04). Tethys
/// hides these from Working mode and sets the narrowest one that matches its
/// own level; a mode that is not listed here stays a working mode.
fn approval_mode_level(provider_id: &str, mode_id: &str) -> Option<&'static str> {
    match (provider_id, mode_id) {
        (crate::providers::claude_code::REGISTRY_ID, "default") => Some("supervised"),
        (crate::providers::claude_code::REGISTRY_ID, "acceptEdits") => Some("auto-edit"),
        (crate::providers::claude_code::REGISTRY_ID, "bypassPermissions") => Some("yolo"),
        (crate::providers::codex::REGISTRY_ID, "read-only") => Some("supervised"),
        (crate::providers::codex::REGISTRY_ID, "auto") => Some("auto-edit"),
        (crate::providers::codex::REGISTRY_ID, "full-access") => Some("yolo"),
        _ => None,
    }
}

/// Appends normalized roles for ACP mode values to Provider metadata.
/// Unknown values stay working modes so a new Provider option remains usable.
pub(crate) fn with_mode_roles(provider_id: &str, option: &ConfigOption, metadata: Value) -> Value {
    let mut object = match metadata {
        Value::Object(object) => object,
        value => Map::from_iter([("provider".into(), value)]),
    };
    let roles = option
        .value_options
        .iter()
        .map(|value| {
            let level = approval_mode_level(provider_id, &value.id);
            let role = level.map_or_else(
                || serde_json::json!({ "kind": "working" }),
                |level| serde_json::json!({ "kind": "approval", "level": level }),
            );
            (value.id.clone(), role)
        })
        .collect();
    object.insert("tethysModeRoles".into(), Value::Object(roles));
    Value::Object(object)
}

#[derive(Clone, Default)]
pub struct ProviderIntegrationRegistry {
    integrations: HashMap<String, AcpProviderIntegration>,
}

impl ProviderIntegrationRegistry {
    /// Production adapters for providers with implemented extension behavior.
    pub fn builtins() -> Self {
        let integrations = [
            crate::providers::claude_code::descriptor(),
            crate::providers::codex::descriptor(),
            crate::providers::opencode::descriptor(),
        ];
        Self {
            integrations: integrations
                .into_iter()
                .map(|integration| (integration.id.clone(), integration))
                .collect(),
        }
    }

    pub fn register(&mut self, integration: AcpProviderIntegration) -> Result<(), String> {
        let id = integration.id.as_str();
        if id.is_empty() {
            return Err("Provider integration id cannot be empty".into());
        }
        let mut methods = HashSet::new();
        for method in &integration.extension_methods {
            if !method.starts_with('_') {
                return Err(format!("ACP extension method must start with _: {method}"));
            }
            if !methods.insert(method) {
                return Err(format!("duplicate ACP extension method claim: {method}"));
            }
        }
        if self.integrations.contains_key(id) {
            return Err(format!("Provider integration already registered: {id}"));
        }
        self.integrations.insert(id.to_owned(), integration);
        Ok(())
    }

    pub fn get(&self, integration_id: &str) -> Option<&AcpProviderIntegration> {
        self.integrations.get(integration_id)
    }

    pub(crate) fn connection(&self, integration_id: &str) -> AcpProviderIntegration {
        self.integrations
            .get(integration_id)
            .cloned()
            .unwrap_or_else(|| AcpProviderIntegration {
                id: integration_id.to_owned(),
                ..Default::default()
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_registered_extension_handlers() {
        use std::sync::Arc;

        let mut registry = ProviderIntegrationRegistry::default();
        let integration = AcpProviderIntegration {
            id: "fixture".into(),
            extension_methods: vec!["_fixture/request".into()],
            extension_request_handler: Some(Arc::new(|method, _params| {
                (method == "_fixture/request").then(|| serde_json::json!({ "handled": true }))
            })),
            extension_notification_handler: Some(Arc::new(|_method, _params| {})),
            ..Default::default()
        };
        registry.register(integration).expect("register");

        let stored = registry.get("fixture").expect("integration");
        let handler = stored.extension_request_handler.as_ref().expect("handler");
        assert_eq!(
            handler("_fixture/request", &Value::Null),
            Some(serde_json::json!({ "handled": true }))
        );
        assert!(stored.extension_notification_handler.is_some());
    }

    #[test]
    fn rejects_duplicate_and_non_extension_method_claims() {
        let mut registry = ProviderIntegrationRegistry::default();
        let duplicate = AcpProviderIntegration {
            id: "fixture".into(),
            extension_methods: vec!["_fixture/request".into(), "_fixture/request".into()],
            ..Default::default()
        };
        assert!(registry.register(duplicate).is_err());

        let standard = AcpProviderIntegration {
            id: "fixture".into(),
            extension_methods: vec!["session/new".into()],
            ..Default::default()
        };
        assert!(registry.register(standard).is_err());
    }

    fn mode_option(ids: &[&str]) -> ConfigOption {
        ConfigOption {
            id: "mode".into(),
            name: "Mode".into(),
            description: None,
            current_value: ids[0].into(),
            values: ids.iter().map(|id| (*id).into()).collect(),
            category: Some("mode".into()),
            kind: None,
            value_options: ids
                .iter()
                .map(|id| tethys_schema::thread::ConfigOptionValue {
                    id: (*id).into(),
                    name: (*id).into(),
                    description: None,
                })
                .collect(),
            recommended_value: None,
            metadata: None,
        }
    }

    fn roles(provider_id: &str, ids: &[&str]) -> Value {
        with_mode_roles(provider_id, &mode_option(ids), Value::Null)["tethysModeRoles"].clone()
    }

    #[test]
    fn classifies_every_claude_permission_preset_as_an_approval_level() {
        let roles = roles(
            crate::providers::claude_code::REGISTRY_ID,
            &["default", "acceptEdits", "plan", "bypassPermissions"],
        );
        assert_eq!(
            roles["default"],
            serde_json::json!({ "kind": "approval", "level": "supervised" })
        );
        assert_eq!(
            roles["acceptEdits"],
            serde_json::json!({ "kind": "approval", "level": "auto-edit" })
        );
        assert_eq!(
            roles["bypassPermissions"],
            serde_json::json!({ "kind": "approval", "level": "yolo" })
        );
        assert_eq!(roles["plan"], serde_json::json!({ "kind": "working" }));
    }

    #[test]
    fn keeps_codex_approval_presets_out_of_working_mode() {
        let roles = roles(
            crate::providers::codex::REGISTRY_ID,
            &["read-only", "auto", "full-access"],
        );
        assert_eq!(
            roles["read-only"],
            serde_json::json!({ "kind": "approval", "level": "supervised" })
        );
        assert_eq!(
            roles["auto"],
            serde_json::json!({ "kind": "approval", "level": "auto-edit" })
        );
        assert_eq!(
            roles["full-access"],
            serde_json::json!({ "kind": "approval", "level": "yolo" })
        );
    }

    #[test]
    fn leaves_opencode_modes_as_working_modes() {
        let roles = roles(crate::providers::opencode::REGISTRY_ID, &["build", "plan"]);
        assert_eq!(roles["build"], serde_json::json!({ "kind": "working" }));
        assert_eq!(roles["plan"], serde_json::json!({ "kind": "working" }));
    }

    #[test]
    fn builtin_claude_descriptor_advertises_only_supported_air_capabilities() {
        let registry = ProviderIntegrationRegistry::builtins();
        let integration = registry.get("claude-acp").expect("Claude integration");
        let capabilities =
            &integration.client_capabilities_meta["jetbrains"]["air"]["capabilities"];
        assert_eq!(
            capabilities,
            &serde_json::json!([
                "nativeSubagentSessions",
                "recommendedValue",
                "sessionFailure"
            ])
        );
    }
}
