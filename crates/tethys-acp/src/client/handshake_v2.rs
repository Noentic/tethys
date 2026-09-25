use super::wire::*;
use super::*;

#[cfg(feature = "acp-v2")]
/// Maps the v2 `auth_methods` declaration; unknown variants degrade to
/// [`AuthMethodShape::Unknown`] rather than dropping the row.
fn auth_methods_v2(methods: &[acp2::AuthMethod]) -> Vec<AuthMethodView> {
    methods
        .iter()
        .map(|method| {
            let shape = match method {
                acp2::AuthMethod::Terminal(_) => AuthMethodShape::CliPassthrough,
                acp2::AuthMethod::Agent(_) => AuthMethodShape::AgentAuth,
                acp2::AuthMethod::Other(other) => AuthMethodShape::Unknown {
                    id: other.method_id.0.as_ref().to_string(),
                },
                _ => AuthMethodShape::Unknown {
                    id: method.method_id().0.as_ref().to_string(),
                },
            };
            auth_method_view(
                method.method_id().0.as_ref(),
                method.name(),
                method.description(),
                shape,
                method
                    .meta()
                    .and_then(|meta| serde_json::to_string(meta).ok()),
            )
        })
        .collect()
}

#[cfg(feature = "acp-v2")]
pub(super) async fn connect_v2<T>(
    options: AcpConnectOptions,
    transport: T,
) -> Result<AcpConnection, ConnectionError>
where
    T: ConnectTo<Client> + Send + 'static,
{
    let shared = Arc::new(Shared::new(&options));
    let (handle_tx, handle_rx) = oneshot::channel();
    let shutdown = CancellationToken::new();
    let token = shutdown.clone();
    let closed = CancellationToken::new();
    let closed_task = closed.clone();
    let connection_shared = shared.clone();

    let notify_shared = shared.clone();
    let request_shared = shared.clone();
    let elicitation_shared = shared.clone();
    let extension_request_shared = shared.clone();
    let extension_notification_shared = shared.clone();
    let client_name = options.client_name.clone();
    let elicitation_enabled = options.services.elicitation.is_some();
    let initialize_meta = options
        .integration
        .as_ref()
        .map(|integration| integration.initialize_meta.clone())
        .filter(|meta| !meta.is_empty());
    let client_capabilities_meta = options
        .integration
        .as_ref()
        .map(|integration| integration.client_capabilities_meta.clone())
        .filter(|meta| !meta.is_empty());
    tokio::spawn(async move {
        let result = Client
            .v2()
            .name("tethys")
            .on_receive_notification(
                move |notification: acp2::UpdateSessionNotification,
                      _connection: V2ConnectionTo<Agent>| {
                    let shared = notify_shared.clone();
                    async move {
                        let session_id = notification.session_id.to_string();
                        let mut events = crate::map_v2::v2_update(&notification.update);
                        let root_session_id = shared.enrich_session_update(
                            &session_id,
                            &notification.update,
                            &mut events,
                        );
                        for event in events {
                            shared.emit(&root_session_id, event);
                        }
                        Ok(())
                    }
                },
                on_receive_notification!(),
            )
            .on_receive_request(
                move |request: acp2::RequestPermissionRequest,
                      responder: Responder<acp2::RequestPermissionResponse>,
                      connection: V2ConnectionTo<Agent>| {
                    let shared = request_shared.clone();
                    async move {
                        let session_id = request.session_id.to_string();
                        let mut permission = crate::map_v2::permission_request(&request);
                        permission.req_id = shared.next_request_id();
                        shared.map_permission_metadata(
                            &serde_json::to_value(&request).unwrap_or(serde_json::Value::Null),
                            &mut permission,
                        );
                        let resolve_shared = shared.clone();
                        connection.spawn(async move {
                            let decision = resolve_shared
                                .resolve_permission(&session_id, permission)
                                .await;
                            responder.respond(v2_permission_response(decision))
                        })?;
                        Ok(())
                    }
                },
                on_receive_request!(),
            )
            .on_receive_request(
                move |request: acp2::CreateElicitationRequest,
                      responder: Responder<acp2::CreateElicitationResponse>,
                      connection: V2ConnectionTo<Agent>| {
                    let shared = elicitation_shared.clone();
                    async move {
                        let Some(session_id) = elicitation_session_v2(&request) else {
                            responder.respond(v2_elicitation_response(
                                tethys_schema::elicitation::ElicitationResponse::without_values(
                                    String::new(),
                                    tethys_schema::elicitation::ElicitationOutcome::Cancelled,
                                ),
                            ))?;
                            return Ok(());
                        };
                        let normalized = crate::elicitation::from_sdk_v2(&request)
                            .or_else(|| {
                                crate::elicitation::from_sdk_v2_url(&request).map(|url| {
                                    tethys_schema::elicitation::ElicitationRequest {
                                        req_id: String::new(),
                                        title: request.message.clone(),
                                        description: None,
                                        url: Some(url),
                                        fields: Vec::new(),
                                        tool_call_id: None,
                                    }
                                })
                            })
                            .unwrap_or_else(|| tethys_schema::elicitation::ElicitationRequest {
                                req_id: String::new(),
                                title: request.message.clone(),
                                description: None,
                                url: None,
                                fields: Vec::new(),
                                tool_call_id: None,
                            });
                        let resolve_shared = shared.clone();
                        connection.spawn(async move {
                            let response = resolve_shared
                                .resolve_elicitation(&session_id, normalized)
                                .await
                                .unwrap_or_else(|| {
                                    tethys_schema::elicitation::ElicitationResponse::without_values(
                                        String::new(),
                                        tethys_schema::elicitation::ElicitationOutcome::Cancelled,
                                    )
                                });
                            responder.respond(v2_elicitation_response(response))
                        })?;
                        Ok(())
                    }
                },
                on_receive_request!(),
            )
            .on_receive_notification(
                move |notification: acp2::AgentNotification, connection: V2ConnectionTo<Agent>| {
                    let shared = extension_notification_shared.clone();
                    async move {
                        let acp2::AgentNotification::ExtNotification(notification) = notification
                        else {
                            return Ok(Handled::No {
                                message: (notification, connection),
                                retry: false,
                            });
                        };
                        shared.handle_extension_notification(
                            &notification.method,
                            notification.params.get().to_string(),
                        );
                        Ok(Handled::Yes)
                    }
                },
                on_receive_notification!(),
            )
            .on_receive_request(
                move |request: acp2::AgentRequest,
                      responder: Responder<serde_json::Value>,
                      connection: V2ConnectionTo<Agent>| {
                    let shared = extension_request_shared.clone();
                    async move {
                        let acp2::AgentRequest::ExtMethodRequest(request) = request else {
                            return Ok(Handled::No {
                                message: (request, responder),
                                retry: false,
                            });
                        };
                        let params = request.params.get().to_string();
                        match shared.prepare_extension_request(&request.method, params) {
                            Ok(ExtensionDispatch::Unclaimed) => responder.respond_with_error(
                                agent_client_protocol::Error::method_not_found(),
                            )?,
                            Ok(ExtensionDispatch::Immediate(value)) => responder.respond(value)?,
                            Ok(ExtensionDispatch::Pending {
                                session_id,
                                request_id,
                                response,
                            }) => {
                                let task = shared.clone().await_extension_response(
                                    session_id.clone(),
                                    request_id.clone(),
                                    response,
                                    responder,
                                );
                                if let Err(error) = connection.spawn(task) {
                                    shared.cancel_extension_request(&session_id, &request_id);
                                    return Err(error);
                                }
                            }
                            Err(()) => responder.respond_with_error(
                                agent_client_protocol::Error::invalid_params(),
                            )?,
                        }
                        Ok(Handled::Yes)
                    }
                },
                on_receive_request!(),
            )
            .connect_with(
                transport,
                move |connection: V2ConnectionTo<Agent>| async move {
                    let closed = connection.clone();
                    let _ = handle_tx.send(connection);
                    tokio::select! {
                        _ = token.cancelled() => {}
                        _ = closed.incoming_closed() => {}
                    }
                    Ok(())
                },
            )
            .await;
        if let Err(error) = result {
            tracing::debug!(%error, "ACP v2 connection ended");
        }
        connection_shared.close_connection();
        closed_task.cancel();
    });

    let wire = handle_rx.await.map_err(|_| {
        ConnectionError::Transport("connection ended before initialize".to_string())
    })?;
    let response = wire
        .send_request(
            acp2::InitializeRequest::new(
                ProtocolVersion::V2,
                acp2::Implementation::new(client_name, env!("CARGO_PKG_VERSION")),
            )
            .capabilities(v2_client_capabilities(
                elicitation_enabled,
                options
                    .integration
                    .as_ref()
                    .is_some_and(|integration| integration.gateway_auth),
                client_capabilities_meta,
            ))
            .meta(initialize_meta),
        )
        .block_task()
        .await
        .map_err(map_sdk_error)?;

    let auth_status_supported = response
        .capabilities
        .meta
        .as_ref()
        .is_some_and(|meta| meta.contains_key("authStatus"));
    shared
        .auth_status_supported
        .store(auth_status_supported, Ordering::Release);
    let mut capabilities = capabilities_v2(&response.capabilities, elicitation_enabled);
    capabilities.provider_extensions = shared.provider_extension_capabilities(
        response.meta.as_ref(),
        capabilities.provider_extensions.provider_routing,
        auth_status_supported,
    );
    capabilities.provider_extensions.gateway_auth &= response
        .auth_methods
        .iter()
        .any(|method| method.method_id().0.as_ref() == "gateway");
    Ok(AcpConnection {
        info: agent_info(
            &response.info.name,
            response.info.version.as_str(),
            response.info.title.as_deref(),
        ),
        capabilities,
        auth_methods: auth_methods_v2(&response.auth_methods),
        terminal_auth: HashMap::new(),
        auth_method_meta: HashMap::new(),
        agent_meta: response.meta.clone(),
        integration_id: options
            .integration
            .as_ref()
            .map(|integration| integration.id.clone()),
        protocol: AcpProtocol::V2,
        wire: Wire::V2(wire),
        shared,
        shutdown,
        closed,
    })
}
