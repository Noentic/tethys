//! Vendor Provider extension wire contract (`ProviderExtension`, M1.6c U12).
//!
//! A `_`-prefixed ACP request or notification, carried through the session
//! stream so registered Provider surfaces can inspect it and answer requests.

use serde::{Deserialize, Serialize};
use specta::Type;

/// One untyped vendor-extension request or notification.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ProviderExtension {
    /// Provider integration id (or `custom-acp` for an unregistered profile).
    pub provider_id: String,
    /// The ACP extension method, verbatim (`_kiro.dev/mcp/oauth_request`).
    pub method: String,
    /// Present for requests waiting for `thread.respond_extension`.
    #[serde(default)]
    pub request_id: Option<String>,
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
        let json = r#"{"provider_id":"kiro","method":"_kiro.dev/mcp/oauth_request","request_id":null,"params":"{\"url\":\"https://example.test\"}"}"#;
        let parsed: ProviderExtension = serde_json::from_str(json).expect(json);
        assert_eq!(
            serde_json::to_value(&parsed).expect("serialize"),
            serde_json::from_str::<serde_json::Value>(json).expect("value"),
        );
    }
}
