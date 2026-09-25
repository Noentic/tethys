use super::*;

pub(super) fn to_v1_block(
    block: ContentBlock,
    capabilities: &NormalizedCapabilities,
) -> Result<acp1::ContentBlock, ConnectionError> {
    match block {
        ContentBlock::Text(text) => Ok(acp1::ContentBlock::Text(acp1::TextContent::new(text))),
        ContentBlock::TextWithMetadata { text, acp_metadata } => Ok(acp1::ContentBlock::Text(
            acp1::TextContent::new(text)
                .annotations(raw_content_metadata_field(&acp_metadata, "annotations"))
                .meta(raw_content_metadata_field(&acp_metadata, "_meta")),
        )),
        ContentBlock::ResourceLink {
            uri,
            name,
            mime_type,
            acp_metadata,
        } => Ok(acp1::ContentBlock::ResourceLink(
            acp1::ResourceLink::new(name, uri)
                .mime_type(mime_type)
                .annotations(content_metadata_field(&acp_metadata, "annotations"))
                .description(content_metadata_field(&acp_metadata, "description"))
                .size(content_metadata_field(&acp_metadata, "size"))
                .title(content_metadata_field(&acp_metadata, "title"))
                .meta(content_metadata_field(&acp_metadata, "_meta")),
        )),
        ContentBlock::Image {
            mime_type,
            data,
            acp_metadata,
        } => {
            if !capabilities.prompt_image {
                return Err(ConnectionError::Unsupported("prompt_image"));
            }
            Ok(acp1::ContentBlock::Image(
                acp1::ImageContent::new(data, mime_type)
                    .annotations(content_metadata_field(&acp_metadata, "annotations"))
                    .uri(content_metadata_field(&acp_metadata, "uri"))
                    .meta(content_metadata_field(&acp_metadata, "_meta")),
            ))
        }
        ContentBlock::Audio {
            mime_type,
            data,
            acp_metadata,
        } => {
            if !capabilities.prompt_audio {
                return Err(ConnectionError::Unsupported("prompt_audio"));
            }
            Ok(acp1::ContentBlock::Audio(
                acp1::AudioContent::new(data, mime_type)
                    .annotations(content_metadata_field(&acp_metadata, "annotations"))
                    .meta(content_metadata_field(&acp_metadata, "_meta")),
            ))
        }
        ContentBlock::Resource {
            uri,
            mime_type,
            text,
            blob,
            acp_metadata,
        } => {
            if !capabilities.prompt_embedded_context {
                return Err(ConnectionError::Unsupported("prompt_embedded_context"));
            }
            let resource_metadata =
                content_metadata_field::<serde_json::Value>(&acp_metadata, "resource_content")
                    .map(|metadata| metadata.to_string());
            let resource = if let Some(text) = text {
                acp1::EmbeddedResourceResource::TextResourceContents(
                    acp1::TextResourceContents::new(text, uri)
                        .mime_type(mime_type)
                        .meta(content_metadata_field(&resource_metadata, "_meta")),
                )
            } else if let Some(blob) = blob {
                acp1::EmbeddedResourceResource::BlobResourceContents(
                    acp1::BlobResourceContents::new(blob, uri)
                        .mime_type(mime_type)
                        .meta(content_metadata_field(&resource_metadata, "_meta")),
                )
            } else {
                return Err(ConnectionError::Protocol(
                    "embedded resource must contain text or blob data".into(),
                ));
            };
            Ok(acp1::ContentBlock::Resource(
                acp1::EmbeddedResource::new(resource)
                    .annotations(content_metadata_field(&acp_metadata, "annotations"))
                    .meta(content_metadata_field(&acp_metadata, "_meta")),
            ))
        }
        ContentBlock::Unknown(_) => Err(ConnectionError::Unsupported("prompt_content_block")),
    }
}

#[cfg(feature = "acp-v2")]
pub(super) fn to_v2_block(
    block: ContentBlock,
    capabilities: &NormalizedCapabilities,
) -> Result<acp2::ContentBlock, ConnectionError> {
    let v1_block = to_v1_block(block, capabilities)?;
    let value = serde_json::to_value(v1_block)
        .map_err(|error| ConnectionError::Protocol(error.to_string()))?;
    serde_json::from_value(value).map_err(|error| ConnectionError::Protocol(error.to_string()))
}

pub(super) fn content_metadata_field<T: serde::de::DeserializeOwned>(
    metadata: &Option<String>,
    field: &str,
) -> Option<T> {
    metadata.as_deref().and_then(|metadata| {
        serde_json::from_str::<serde_json::Value>(metadata)
            .ok()?
            .get(field)
            .cloned()
            .and_then(|value| serde_json::from_value(value).ok())
    })
}

pub(super) fn raw_content_metadata_field<T: serde::de::DeserializeOwned>(
    metadata: &str,
    field: &str,
) -> Option<T> {
    serde_json::from_str::<serde_json::Value>(metadata)
        .ok()?
        .get(field)
        .cloned()
        .and_then(|value| serde_json::from_value(value).ok())
}

pub(super) fn v1_permission_response(
    decision: PermissionDecision,
) -> acp1::RequestPermissionResponse {
    let outcome = match (decision.outcome, decision.option_id) {
        (PermOutcome::Approved | PermOutcome::Rejected, Some(option_id)) => {
            acp1::RequestPermissionOutcome::Selected(acp1::SelectedPermissionOutcome::new(
                option_id,
            ))
        }
        _ => acp1::RequestPermissionOutcome::Cancelled,
    };
    acp1::RequestPermissionResponse::new(outcome)
}

#[cfg(feature = "acp-v2")]
pub(super) fn v2_permission_response(
    decision: PermissionDecision,
) -> acp2::RequestPermissionResponse {
    let outcome = match (decision.outcome, decision.option_id) {
        (PermOutcome::Approved | PermOutcome::Rejected, Some(option_id)) => {
            acp2::RequestPermissionOutcome::Selected(acp2::SelectedPermissionOutcome::new(
                option_id,
            ))
        }
        _ => acp2::RequestPermissionOutcome::Cancelled,
    };
    acp2::RequestPermissionResponse::new(outcome)
}

pub(super) fn capabilities_v1(
    capabilities: &acp1::AgentCapabilities,
    elicitation: bool,
) -> NormalizedCapabilities {
    let session = &capabilities.session_capabilities;
    NormalizedCapabilities {
        load_session: capabilities.load_session,
        resume: session.resume.is_some(),
        close_session: session.close.is_some(),
        list_sessions: session.list.is_some(),
        delete_session: session.delete.is_some(),
        logout: capabilities.auth.logout.is_some(),
        mcp: McpTransports {
            stdio: true,
            http: capabilities.mcp_capabilities.http,
            sse: capabilities.mcp_capabilities.sse,
        },
        prompt_text: true,
        prompt_resource_link: true,
        prompt_image: capabilities.prompt_capabilities.image,
        prompt_audio: capabilities.prompt_capabilities.audio,
        prompt_embedded_context: capabilities.prompt_capabilities.embedded_context,
        elicitation,
        session_fork: session.fork.is_some(),
        provider_extensions: tethys_schema::connection::ProviderExtensionCapabilities {
            provider_routing: capabilities.providers.is_some(),
            ..Default::default()
        },
    }
}

pub(super) fn v1_client_capabilities(
    elicitation: bool,
    terminal_auth: bool,
    gateway_auth: bool,
    meta: Option<serde_json::Map<String, serde_json::Value>>,
) -> acp1::ClientCapabilities {
    let mut capabilities = acp1::ClientCapabilities::new()
        .fs(acp1::FileSystemCapabilities::new()
            .read_text_file(true)
            .write_text_file(true))
        .terminal(true);
    let mut auth = acp1::AuthCapabilities::new().terminal(terminal_auth);
    if gateway_auth {
        auth = auth.meta(serde_json::Map::from_iter([(
            "gateway".into(),
            serde_json::Value::Bool(true),
        )]));
    }
    capabilities.auth = auth;
    if elicitation {
        capabilities.elicitation = Some(
            acp1::ElicitationCapabilities::new().form(acp1::ElicitationFormCapabilities::new()),
        );
    }
    if let Some(meta) = meta {
        capabilities = capabilities.meta(meta);
    }
    capabilities
}

#[cfg(feature = "acp-v2")]
pub(super) fn capabilities_v2(
    capabilities: &acp2::AgentCapabilities,
    elicitation: bool,
) -> NormalizedCapabilities {
    let session = capabilities.session.as_ref();
    let mcp = session.and_then(|session| session.mcp.as_ref());
    NormalizedCapabilities {
        load_session: false,
        resume: session.is_some(),
        close_session: false,
        list_sessions: false,
        delete_session: session.is_some_and(|session| session.delete.is_some()),
        logout: false,
        mcp: McpTransports {
            stdio: mcp.and_then(|mcp| mcp.stdio.as_ref()).is_some(),
            http: mcp.and_then(|mcp| mcp.http.as_ref()).is_some(),
            sse: false,
        },
        prompt_text: true,
        prompt_resource_link: true,
        prompt_image: session
            .and_then(|session| session.prompt.as_ref())
            .is_some_and(|prompt| prompt.image.is_some()),
        prompt_audio: session
            .and_then(|session| session.prompt.as_ref())
            .is_some_and(|prompt| prompt.audio.is_some()),
        prompt_embedded_context: session
            .and_then(|session| session.prompt.as_ref())
            .is_some_and(|prompt| prompt.embedded_context.is_some()),
        elicitation,
        session_fork: session.and_then(|session| session.fork.as_ref()).is_some(),
        provider_extensions: tethys_schema::connection::ProviderExtensionCapabilities {
            provider_routing: capabilities.providers.is_some(),
            ..Default::default()
        },
    }
}

#[cfg(feature = "acp-v2")]
pub(super) fn v2_client_capabilities(
    elicitation: bool,
    gateway_auth: bool,
    meta: Option<serde_json::Map<String, serde_json::Value>>,
) -> acp2::ClientCapabilities {
    let mut capabilities = acp2::ClientCapabilities::new();
    if gateway_auth {
        capabilities = capabilities.auth(acp2::AuthCapabilities::new().meta(
            serde_json::Map::from_iter([("gateway".into(), serde_json::Value::Bool(true))]),
        ));
    }
    if elicitation {
        capabilities.elicitation = Some(
            acp2::ElicitationCapabilities::new().form(acp2::ElicitationFormCapabilities::new()),
        );
    }
    if let Some(meta) = meta {
        capabilities = capabilities.meta(meta);
    }
    capabilities
}

/// The session an elicitation is scoped to, when session-scoped.
pub(super) fn elicitation_session_v1(request: &acp1::CreateElicitationRequest) -> Option<String> {
    match request.scope() {
        acp1::ElicitationScope::Session(scope) => Some(scope.session_id.to_string()),
        _ => None,
    }
}

pub(super) fn canonical_extension_method(method: &str) -> String {
    if method.starts_with('_') {
        method.to_string()
    } else {
        format!("_{method}")
    }
}

pub(super) fn extension_session_id(params: &serde_json::Value) -> Option<String> {
    params
        .get("sessionId")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
}

pub(super) fn provider_auth_status(params: &serde_json::Value) -> Option<ProviderAuthStatus> {
    let status = params.get("authStatus")?;
    let bounded = |value: Option<&serde_json::Value>, max| {
        value
            .and_then(serde_json::Value::as_str)
            .filter(|value| value.len() <= max)
            .map(str::to_owned)
    };
    let kind = bounded(status.get("kind"), 64)?;
    let label = bounded(status.get("label"), 256)?;
    let account = status.get("account");
    Some(ProviderAuthStatus {
        kind,
        label,
        detail: bounded(status.get("detail"), 512),
        email: bounded(account.and_then(|account| account.get("email")), 256),
        organization: bounded(account.and_then(|account| account.get("organization")), 256),
        plan: bounded(account.and_then(|account| account.get("plan")), 128),
    })
}

pub(super) fn meta_has_air_capability(
    meta: Option<&serde_json::Map<String, serde_json::Value>>,
    capability: &str,
) -> bool {
    meta.and_then(|meta| meta.get("jetbrains"))
        .and_then(|meta| meta.get("air"))
        .and_then(|meta| meta.get("capabilities"))
        .and_then(serde_json::Value::as_array)
        .is_some_and(|capabilities| {
            capabilities
                .iter()
                .any(|value| value.as_str() == Some(capability))
        })
}

#[cfg(feature = "acp-v2")]
pub(super) fn elicitation_session_v2(request: &acp2::CreateElicitationRequest) -> Option<String> {
    match request.scope() {
        acp2::ElicitationScope::Session(scope) => Some(scope.session_id.to_string()),
        _ => None,
    }
}

pub(super) fn elicitation_content(
    values: std::collections::BTreeMap<String, tethys_schema::elicitation::ElicitationValue>,
) -> std::collections::BTreeMap<String, acp1::ElicitationContentValue> {
    use tethys_schema::elicitation::ElicitationValue;
    values
        .into_iter()
        .map(|(key, value)| {
            let value = match value {
                ElicitationValue::Text(text) => acp1::ElicitationContentValue::String(text),
                ElicitationValue::Number(number) => acp1::ElicitationContentValue::Number(number),
                ElicitationValue::Boolean(boolean) => {
                    acp1::ElicitationContentValue::Boolean(boolean)
                }
                ElicitationValue::TextList(texts) => {
                    acp1::ElicitationContentValue::StringArray(texts)
                }
            };
            (key, value)
        })
        .collect()
}

pub(super) fn v1_elicitation_response(
    response: tethys_schema::elicitation::ElicitationResponse,
) -> acp1::CreateElicitationResponse {
    use tethys_schema::elicitation::ElicitationOutcome;
    let action = match response.outcome {
        ElicitationOutcome::Accepted => acp1::ElicitationAction::Accept(
            acp1::ElicitationAcceptAction::new().content(elicitation_content(response.values)),
        ),
        ElicitationOutcome::Declined => acp1::ElicitationAction::Decline,
        ElicitationOutcome::Cancelled => acp1::ElicitationAction::Cancel,
    };
    acp1::CreateElicitationResponse::new(action)
}

#[cfg(feature = "acp-v2")]
pub(super) fn v2_elicitation_response(
    response: tethys_schema::elicitation::ElicitationResponse,
) -> acp2::CreateElicitationResponse {
    use tethys_schema::elicitation::ElicitationOutcome;
    let action = match response.outcome {
        ElicitationOutcome::Accepted => acp2::ElicitationAction::Accept(
            acp2::ElicitationAcceptAction::new().content(v2_elicitation_content(response.values)),
        ),
        ElicitationOutcome::Declined => acp2::ElicitationAction::Decline,
        ElicitationOutcome::Cancelled => acp2::ElicitationAction::Cancel,
    };
    acp2::CreateElicitationResponse::new(action)
}

#[cfg(feature = "acp-v2")]
pub(super) fn v2_elicitation_content(
    values: std::collections::BTreeMap<String, tethys_schema::elicitation::ElicitationValue>,
) -> std::collections::BTreeMap<String, acp2::ElicitationContentValue> {
    use tethys_schema::elicitation::ElicitationValue;
    values
        .into_iter()
        .map(|(key, value)| {
            let value = match value {
                ElicitationValue::Text(text) => acp2::ElicitationContentValue::String(text),
                ElicitationValue::Number(number) => acp2::ElicitationContentValue::Number(number),
                ElicitationValue::Boolean(boolean) => {
                    acp2::ElicitationContentValue::Boolean(boolean)
                }
                ElicitationValue::TextList(texts) => {
                    acp2::ElicitationContentValue::StringArray(texts)
                }
            };
            (key, value)
        })
        .collect()
}

pub(super) fn parse_session_servers(values: &[serde_json::Value]) -> Vec<SessionServer> {
    values
        .iter()
        .filter_map(|value| serde_json::from_value(value.clone()).ok())
        .collect()
}

pub(super) fn resolved_value(value: &RegistryValue) -> Option<String> {
    match value {
        RegistryValue::Plain(text) => Some(text.clone()),
        RegistryValue::Secret { .. } => None,
    }
}

/// v1 mode state first, then config options, in the normalized option shape.
pub(super) fn v1_session_config(
    modes: Option<&acp1::SessionModeState>,
    options: Option<&Vec<acp1::SessionConfigOption>>,
) -> Vec<ConfigOption> {
    let mut config = Vec::new();
    if let Some(state) = modes {
        config.push(map::mode_option(state));
    }
    if let Some(options) = options {
        config.extend(options.iter().map(map::config_option));
    }
    config
}

pub(super) fn v1_mcp_servers(
    values: &[serde_json::Value],
    transports: &McpTransports,
) -> Vec<acp1::McpServer> {
    parse_session_servers(values)
        .into_iter()
        .filter_map(|server| match server.transport {
            TransportKind::Stdio if transports.stdio => {
                let command = server.command?;
                let env = server
                    .env
                    .iter()
                    .filter_map(|(key, value)| {
                        resolved_value(value).map(|value| acp1::EnvVariable::new(key, value))
                    })
                    .collect();
                Some(acp1::McpServer::Stdio(
                    acp1::McpServerStdio::new(server.name, command)
                        .args(server.args)
                        .env(env),
                ))
            }
            TransportKind::Http if transports.http => {
                let url = server.url?;
                let headers = server
                    .headers
                    .iter()
                    .filter_map(|(key, value)| {
                        resolved_value(value).map(|value| acp1::HttpHeader::new(key, value))
                    })
                    .collect();
                Some(acp1::McpServer::Http(
                    acp1::McpServerHttp::new(server.name, url).headers(headers),
                ))
            }
            TransportKind::Sse if transports.sse => {
                let url = server.url?;
                Some(acp1::McpServer::Sse(acp1::McpServerSse::new(
                    server.name,
                    url,
                )))
            }
            _ => None,
        })
        .collect()
}

#[cfg(feature = "acp-v2")]
pub(super) fn v2_mcp_servers(
    values: &[serde_json::Value],
    transports: &McpTransports,
) -> Vec<acp2::McpServer> {
    parse_session_servers(values)
        .into_iter()
        .filter_map(|server| match server.transport {
            TransportKind::Stdio if transports.stdio => {
                let command = server.command?;
                let env = server
                    .env
                    .iter()
                    .filter_map(|(key, value)| {
                        resolved_value(value).map(|value| acp2::EnvVariable::new(key, value))
                    })
                    .collect();
                Some(acp2::McpServer::Stdio(
                    acp2::McpServerStdio::new(server.name, command)
                        .args(server.args)
                        .env(env),
                ))
            }
            TransportKind::Http if transports.http => {
                let url = server.url?;
                let headers = server
                    .headers
                    .iter()
                    .filter_map(|(key, value)| {
                        resolved_value(value).map(|value| acp2::HttpHeader::new(key, value))
                    })
                    .collect();
                Some(acp2::McpServer::Http(
                    acp2::McpServerHttp::new(server.name, url).headers(headers),
                ))
            }
            _ => None,
        })
        .collect()
}

pub(super) fn agent_info(name: &str, version: &str, title: Option<&str>) -> AgentInfo {
    AgentInfo {
        name: name.to_string(),
        version: version.to_string(),
        title: title.map(str::to_string),
    }
}

pub(super) fn map_sdk_error(error: agent_client_protocol::Error) -> ConnectionError {
    if error.code == acp1::ErrorCode::AuthRequired {
        ConnectionError::AuthRequired
    } else {
        ConnectionError::Remote {
            code: i32::from(error.code),
            message: error.message,
            data: error.data,
        }
    }
}
