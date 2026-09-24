use super::*;

pub(super) fn auth_login_metadata(
    method: &tethys_schema::agents::AuthMethodView,
    input: Option<AgentLoginInput>,
    gateway_auth: bool,
) -> Result<Option<serde_json::Map<String, serde_json::Value>>, ApiError> {
    let declared = method
        .metadata
        .as_deref()
        .and_then(|metadata| {
            serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(metadata).ok()
        })
        .unwrap_or_default();
    match input {
        Some(AgentLoginInput::ApiKey { api_key }) => {
            if method.id != "api-key"
                || !declared.contains_key("api-key")
                || api_key.trim().is_empty()
                || api_key.len() > 8192
                || api_key.chars().any(char::is_control)
            {
                return Err(ApiError::InvalidConfig(
                    "invalid API-key authentication input".into(),
                ));
            }
            Ok(Some(serde_json::Map::from_iter([(
                "api-key".into(),
                serde_json::json!({ "apiKey": api_key }),
            )])))
        }
        Some(AgentLoginInput::Gateway {
            base_url,
            provider_name,
            headers,
        }) => {
            let parsed = url::Url::parse(&base_url)
                .map_err(|_| ApiError::InvalidConfig("invalid gateway URL".into()))?;
            if method.id != "gateway"
                || !gateway_auth
                || !declared.contains_key("gateway")
                || !matches!(parsed.scheme(), "http" | "https")
                || parsed.host().is_none()
                || !parsed.username().is_empty()
                || parsed.password().is_some()
                || parsed.query().is_some()
                || parsed.fragment().is_some()
                || base_url.len() > 2048
                || headers.len() > 64
                || headers.iter().any(|(key, value)| {
                    key.is_empty()
                        || key.len() > 256
                        || !key
                            .chars()
                            .all(|c| c.is_ascii_alphanumeric() || "!#$%&'*+-.^_`|~".contains(c))
                        || value.len() > 8192
                        || value.chars().any(char::is_control)
                })
                || headers
                    .iter()
                    .map(|(key, value)| key.len() + value.len())
                    .sum::<usize>()
                    > 16_384
                || provider_name.as_ref().is_some_and(|name| {
                    name.trim().is_empty() || name.len() > 128 || name.chars().any(char::is_control)
                })
            {
                return Err(ApiError::InvalidConfig(
                    "invalid custom gateway authentication input".into(),
                ));
            }
            let mut gateway = serde_json::Map::from_iter([
                ("baseUrl".into(), serde_json::Value::String(base_url)),
                (
                    "headers".into(),
                    serde_json::Value::Object(
                        headers
                            .into_iter()
                            .map(|(key, value)| (key, serde_json::Value::String(value)))
                            .collect(),
                    ),
                ),
            ]);
            if let Some(provider_name) = provider_name {
                gateway.insert(
                    "providerName".into(),
                    serde_json::Value::String(provider_name),
                );
            }
            Ok(Some(serde_json::Map::from_iter([(
                "gateway".into(),
                serde_json::Value::Object(gateway),
            )])))
        }
        None if method.id == "gateway" => Err(ApiError::InvalidConfig(
            "custom gateway authentication input is required".into(),
        )),
        None => Ok(None),
    }
}

#[cfg(test)]
mod auth_login_metadata_tests {
    use super::*;

    fn auth_method(id: &str, metadata: &str) -> tethys_schema::agents::AuthMethodView {
        tethys_schema::agents::AuthMethodView {
            id: id.into(),
            name: id.into(),
            description: None,
            shape: AuthMethodShape::AgentAuth,
            metadata: Some(metadata.into()),
        }
    }

    #[test]
    fn api_key_payload_is_forwarded_only_for_an_advertised_method() {
        let method = auth_method("api-key", r#"{"api-key":{"provider":"openai"}}"#);
        let metadata = auth_login_metadata(
            &method,
            Some(AgentLoginInput::ApiKey {
                api_key: "temporary-key".into(),
            }),
            false,
        )
        .expect("valid API key")
        .expect("metadata");
        assert_eq!(metadata["api-key"]["apiKey"], "temporary-key");
        assert!(auth_login_metadata(
            &auth_method("other", r#"{"api-key":{}}"#),
            Some(AgentLoginInput::ApiKey {
                api_key: "temporary-key".into(),
            }),
            false,
        )
        .is_err());
    }

    #[test]
    fn gateway_payload_requires_negotiated_method_and_rejects_header_injection() {
        let method = auth_method("gateway", r#"{"gateway":{"protocol":"openai"}}"#);
        let input = AgentLoginInput::Gateway {
            base_url: "https://gateway.example.test/v1".into(),
            provider_name: Some("team".into()),
            headers: std::collections::BTreeMap::from([(
                "Authorization".into(),
                "Bearer transient".into(),
            )]),
        };
        assert!(auth_login_metadata(&method, Some(input.clone()), false).is_err());
        assert_eq!(
            auth_login_metadata(&method, Some(input), true)
                .expect("valid gateway")
                .expect("metadata")["gateway"]["headers"]["Authorization"],
            "Bearer transient"
        );
        let invalid = AgentLoginInput::Gateway {
            base_url: "https://gateway.example.test".into(),
            provider_name: None,
            headers: std::collections::BTreeMap::from([(
                "Authorization".into(),
                "Bearer ok\r\nX-Evil: yes".into(),
            )]),
        };
        assert!(auth_login_metadata(&method, Some(invalid), true).is_err());
    }
}
