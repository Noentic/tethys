//! Optional Provider-owned ACP extensions. Standard ACP agents need no entry.

use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value};
use tethys_acp::client::{
    AcpProviderIntegration, ExtensionNotificationHandler, ExtensionRequestHandler,
};

/// A Provider's optional ACP surface. Providers supply handlers only when the
/// shared UI responder cannot answer a claimed method (M1.17 AD3).
#[derive(Clone, Default)]
pub struct ProviderIntegrationDescriptor {
    pub initialize_meta: Map<String, Value>,
    pub extension_methods: Vec<String>,
    /// Answers claimed requests immediately; `None` responses reach the UI.
    pub handle_extension_request: Option<ExtensionRequestHandler>,
    /// Observes claimed notifications; the normalized event still emits.
    pub handle_extension_notification: Option<ExtensionNotificationHandler>,
}

impl std::fmt::Debug for ProviderIntegrationDescriptor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ProviderIntegrationDescriptor")
            .field("initialize_meta", &self.initialize_meta)
            .field("extension_methods", &self.extension_methods)
            .field(
                "handle_extension_request",
                &self.handle_extension_request.is_some(),
            )
            .field(
                "handle_extension_notification",
                &self.handle_extension_notification.is_some(),
            )
            .finish()
    }
}

#[derive(Debug, Clone, Default)]
pub struct ProviderIntegrationRegistry {
    descriptors: HashMap<String, ProviderIntegrationDescriptor>,
}

impl ProviderIntegrationRegistry {
    pub fn register(
        &mut self,
        integration_id: impl Into<String>,
        descriptor: ProviderIntegrationDescriptor,
    ) -> Result<(), String> {
        let integration_id = integration_id.into();
        if integration_id.is_empty() {
            return Err("Provider integration id cannot be empty".into());
        }
        let mut methods = HashSet::new();
        for method in &descriptor.extension_methods {
            if !method.starts_with('_') {
                return Err(format!("ACP extension method must start with _: {method}"));
            }
            if !methods.insert(method) {
                return Err(format!("duplicate ACP extension method claim: {method}"));
            }
        }
        if self.descriptors.contains_key(&integration_id) {
            return Err(format!(
                "Provider integration already registered: {integration_id}"
            ));
        }
        self.descriptors.insert(integration_id, descriptor);
        Ok(())
    }

    pub fn get(&self, integration_id: &str) -> Option<&ProviderIntegrationDescriptor> {
        self.descriptors.get(integration_id)
    }

    pub(crate) fn connection(&self, integration_id: &str) -> AcpProviderIntegration {
        let descriptor = self.descriptors.get(integration_id);
        AcpProviderIntegration {
            id: integration_id.to_string(),
            initialize_meta: descriptor
                .map(|value| value.initialize_meta.clone())
                .unwrap_or_default(),
            extension_methods: descriptor
                .map(|value| value.extension_methods.clone())
                .unwrap_or_default(),
            extension_request_handler: descriptor
                .and_then(|value| value.handle_extension_request.clone()),
            extension_notification_handler: descriptor
                .and_then(|value| value.handle_extension_notification.clone()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_registered_extension_handlers() {
        use std::sync::Arc;

        let mut registry = ProviderIntegrationRegistry::default();
        let descriptor = ProviderIntegrationDescriptor {
            extension_methods: vec!["_fixture/request".into()],
            handle_extension_request: Some(Arc::new(|method, _params| {
                (method == "_fixture/request").then(|| serde_json::json!({ "handled": true }))
            })),
            handle_extension_notification: Some(Arc::new(|_method, _params| {})),
            ..Default::default()
        };
        registry.register("fixture", descriptor).expect("register");

        let stored = registry.get("fixture").expect("descriptor");
        let handler = stored.handle_extension_request.as_ref().expect("handler");
        assert_eq!(
            handler("_fixture/request", &Value::Null),
            Some(serde_json::json!({ "handled": true }))
        );
        assert!(stored.handle_extension_notification.is_some());
    }

    #[test]
    fn rejects_duplicate_and_non_extension_method_claims() {
        let mut registry = ProviderIntegrationRegistry::default();
        let duplicate = ProviderIntegrationDescriptor {
            extension_methods: vec!["_fixture/request".into(), "_fixture/request".into()],
            ..Default::default()
        };
        assert!(registry.register("fixture", duplicate).is_err());

        let standard = ProviderIntegrationDescriptor {
            extension_methods: vec!["session/new".into()],
            ..Default::default()
        };
        assert!(registry.register("fixture", standard).is_err());
    }
}
