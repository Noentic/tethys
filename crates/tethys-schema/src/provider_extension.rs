//! Vendor Provider extension wire contract (`ProviderExtension`, M1.6c U12).
//!
//! A `_`-prefixed ACP notification (e.g. `_kiro.dev/mcp/oauth_request`) that
//! the connection has no typed handler for. `TurnEventBody::Unknown` carries
//! only a raw string with no method, so nothing can be keyed by it; this type
//! carries the `method` a registered Provider surface resolves on. The
//! transport that turns a vendor notification into this event is M1.17.

use serde::{Deserialize, Serialize};
use specta::Type;

/// One untyped vendor-extension request, keyed by Provider and method.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ProviderExtension {
    /// Provider that raised the request (its profile/registry id).
    pub provider_id: String,
    /// The ACP extension method, verbatim (`_kiro.dev/mcp/oauth_request`).
    pub method: String,
    /// The request payload as a JSON string, matching
    /// `TurnEventBody::Unknown { raw }`'s convention and keeping this crate's
    /// runtime dependencies at serde + specta.
    pub params: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_byte_identically() {
        let json = r#"{"provider_id":"kiro","method":"_kiro.dev/mcp/oauth_request","params":"{\"url\":\"https://example.test\"}"}"#;
        let parsed: ProviderExtension = serde_json::from_str(json).expect(json);
        assert_eq!(
            serde_json::to_value(&parsed).expect("serialize"),
            serde_json::from_str::<serde_json::Value>(json).expect("value"),
        );
    }
}
