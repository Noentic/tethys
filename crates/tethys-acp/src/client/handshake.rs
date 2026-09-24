use super::inbound::merge_session_update_meta;
use super::wire::*;
use super::*;

/// Maps the v1 `auth_methods` declaration to the UI-visible shape list.
pub(super) fn auth_methods_v1(methods: &[acp1::AuthMethod]) -> Vec<AuthMethodView> {
    methods
        .iter()
        .map(|method| {
            let shape = match method {
                acp1::AuthMethod::Terminal(_) => AuthMethodShape::CliPassthrough,
                acp1::AuthMethod::Agent(_) => AuthMethodShape::AgentAuth,
                _ => AuthMethodShape::Unknown {
                    id: method.id().0.as_ref().to_string(),
                },
            };
            auth_method_view(
                method.id().0.as_ref(),
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

pub(super) fn terminal_auth_v1(methods: &[acp1::AuthMethod]) -> HashMap<String, TerminalAuthSpec> {
    methods
        .iter()
        .filter_map(|method| match method {
            acp1::AuthMethod::Terminal(method) => Some((
                method.id.0.as_ref().to_string(),
                TerminalAuthSpec {
                    args: method.args.clone(),
                    env: method.env.clone(),
                },
            )),
            _ => None,
        })
        .collect()
}

pub(super) fn auth_method_meta_v1(
    methods: &[acp1::AuthMethod],
) -> HashMap<String, serde_json::Map<String, serde_json::Value>> {
    methods
        .iter()
        .filter_map(|method| {
            method
                .meta()
                .filter(|meta| !meta.is_empty())
                .map(|meta| (method.id().0.as_ref().to_string(), meta.clone()))
        })
        .collect()
}

pub(super) async fn connect_v1<T>(
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
    let filesystem_read_shared = shared.clone();
    let filesystem_write_shared = shared.clone();
    let terminal_create_shared = shared.clone();
    let terminal_output_shared = shared.clone();
    let terminal_wait_shared = shared.clone();
    let terminal_kill_shared = shared.clone();
    let terminal_release_shared = shared.clone();
    let client_name = options.client_name.clone();
    let elicitation_enabled = options.services.elicitation.is_some();
    let terminal_auth_enabled = options.services.terminal_auth;
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
            .builder()
            .name("tethys")
            .on_receive_notification(
                move |notification: RawSessionNotification, _connection: ConnectionTo<Agent>| {
                    let shared = notify_shared.clone();
                    async move {
                        let session_id = notification.session_id;
                        let raw_update =
                            merge_session_update_meta(notification.update, notification.meta);
                        let (root_session_id, events) = shared.map_v1(&session_id, &raw_update);
                        for event in events {
                            shared.emit(&root_session_id, event);
                        }
                        Ok(())
                    }
                },
                on_receive_notification!(),
            )
            .on_receive_request(
                move |request: acp1::RequestPermissionRequest,
                      responder: Responder<acp1::RequestPermissionResponse>,
                      connection: ConnectionTo<Agent>| {
                    let shared = request_shared.clone();
                    async move {
                        let session_id = request.session_id.to_string();
                        let req_id = shared.next_request_id();
                        let title = request
                            .tool_call
                            .fields
                            .title
                            .clone()
                            .unwrap_or_else(|| request.tool_call.tool_call_id.to_string());
                        let mut permission = PermissionRequested {
                            req_id,
                            title,
                            description: None,
                            subject: Some(map::permission_subject(&request.tool_call)),
                            options: request
                                .options
                                .iter()
                                .map(|option| tethys_schema::thread::PermOption {
                                    option_id: option.option_id.to_string(),
                                    name: option.name.clone(),
                                    kind: Some(map::label(&option.kind)),
                                    description: None,
                                    metadata: None,
                                })
                                .collect(),
                            metadata: None,
                        };
                        shared.map_permission_metadata(
                            &serde_json::to_value(&request).unwrap_or(serde_json::Value::Null),
                            &mut permission,
                        );
                        let resolve_shared = shared.clone();
                        connection.spawn(async move {
                            let decision = resolve_shared
                                .resolve_permission(&session_id, permission)
                                .await;
                            responder.respond(v1_permission_response(decision))
                        })?;
                        Ok(())
                    }
                },
                on_receive_request!(),
            )
            .on_receive_request(
                move |request: acp1::ReadTextFileRequest,
                      responder: Responder<acp1::ReadTextFileResponse>,
                      _connection: ConnectionTo<Agent>| {
                    let shared = filesystem_read_shared.clone();
                    async move {
                        let session_id = request.session_id.to_string();
                        match shared
                            .read_text_file(&session_id, &request.path, request.line, request.limit)
                            .await
                        {
                            Ok(content) => {
                                responder.respond(acp1::ReadTextFileResponse::new(content))
                            }
                            Err(error) => responder.respond_with_internal_error(error),
                        }
                    }
                },
                on_receive_request!(),
            )
            .on_receive_request(
                move |request: acp1::WriteTextFileRequest,
                      responder: Responder<acp1::WriteTextFileResponse>,
                      _connection: ConnectionTo<Agent>| {
                    let shared = filesystem_write_shared.clone();
                    async move {
                        let session_id = request.session_id.to_string();
                        match shared
                            .write_text_file(&session_id, &request.path, &request.content)
                            .await
                        {
                            Ok(()) => responder.respond(acp1::WriteTextFileResponse::new()),
                            Err(error) => responder.respond_with_internal_error(error),
                        }
                    }
                },
                on_receive_request!(),
            )
            .on_receive_request(
                move |request: acp1::CreateTerminalRequest,
                      responder: Responder<acp1::CreateTerminalResponse>,
                      _connection: ConnectionTo<Agent>| {
                    let shared = terminal_create_shared.clone();
                    async move {
                        let session_id = shared.root_session_id(&request.session_id.to_string());
                        let requested_cwd = match request.cwd {
                            Some(cwd) => cwd,
                            None => match shared.session_directory(&session_id).await {
                                Ok(cwd) => cwd,
                                Err(error) => return responder.respond_with_internal_error(error),
                            },
                        };
                        let cwd = match shared
                            .checked_path(&session_id, &requested_cwd, false)
                            .await
                        {
                            Ok(cwd) => cwd,
                            Err(error) => return responder.respond_with_internal_error(error),
                        };
                        match tokio::fs::metadata(&cwd).await {
                            Ok(metadata) if metadata.is_dir() => {}
                            Ok(_) => {
                                return responder
                                    .respond_with_internal_error("terminal cwd is not a directory")
                            }
                            Err(error) => return responder.respond_with_internal_error(error),
                        }
                        let command = request.command.clone();
                        let title = std::iter::once(command.as_str())
                            .chain(request.args.iter().map(String::as_str))
                            .collect::<Vec<_>>()
                            .join(" ");
                        let output_shared = shared.clone();
                        let output_session = session_id.clone();
                        let output_title = title.clone();
                        let output_announced = Arc::new(std::sync::atomic::AtomicBool::new(false));
                        let response_announced = output_announced.clone();
                        let on_output = Arc::new(move |terminal_id: String, bytes: String| {
                            if !output_announced.swap(true, Ordering::Relaxed) {
                                output_shared.emit(
                                    &output_session,
                                    TurnEventBody::TerminalUpsert {
                                        terminal_id: terminal_id.clone(),
                                        patch: tethys_schema::thread::Patch::Set(
                                            output_title.clone(),
                                        ),
                                    },
                                );
                            }
                            output_shared.emit(
                                &output_session,
                                TurnEventBody::TerminalOutputChunk { terminal_id, bytes },
                            );
                        });
                        match shared
                            .terminals
                            .create(
                                session_id.clone(),
                                command,
                                request.args,
                                request.env,
                                cwd,
                                request.output_byte_limit,
                                on_output,
                            )
                            .await
                        {
                            Ok(terminal_id) => {
                                if !response_announced.swap(true, Ordering::Relaxed) {
                                    shared.emit(
                                        &session_id,
                                        TurnEventBody::TerminalUpsert {
                                            terminal_id: terminal_id.clone(),
                                            patch: tethys_schema::thread::Patch::Set(title),
                                        },
                                    );
                                }
                                responder.respond(acp1::CreateTerminalResponse::new(terminal_id))
                            }
                            Err(error) => responder.respond_with_internal_error(error),
                        }
                    }
                },
                on_receive_request!(),
            )
            .on_receive_request(
                move |request: acp1::TerminalOutputRequest,
                      responder: Responder<acp1::TerminalOutputResponse>,
                      _connection: ConnectionTo<Agent>| {
                    let shared = terminal_output_shared.clone();
                    async move {
                        let session_id = shared.root_session_id(&request.session_id.to_string());
                        match shared
                            .terminals
                            .output(&session_id, request.terminal_id.0.as_ref())
                        {
                            Ok(response) => responder.respond(response),
                            Err(error) => responder.respond_with_internal_error(error),
                        }
                    }
                },
                on_receive_request!(),
            )
            .on_receive_request(
                move |request: acp1::WaitForTerminalExitRequest,
                      responder: Responder<acp1::WaitForTerminalExitResponse>,
                      _connection: ConnectionTo<Agent>| {
                    let shared = terminal_wait_shared.clone();
                    async move {
                        let session_id = shared.root_session_id(&request.session_id.to_string());
                        match shared
                            .terminals
                            .wait_for_exit(&session_id, request.terminal_id.0.as_ref())
                            .await
                        {
                            Ok(response) => responder.respond(response),
                            Err(error) => responder.respond_with_internal_error(error),
                        }
                    }
                },
                on_receive_request!(),
            )
            .on_receive_request(
                move |request: acp1::KillTerminalRequest,
                      responder: Responder<acp1::KillTerminalResponse>,
                      _connection: ConnectionTo<Agent>| {
                    let shared = terminal_kill_shared.clone();
                    async move {
                        let session_id = shared.root_session_id(&request.session_id.to_string());
                        match shared
                            .terminals
                            .kill(&session_id, request.terminal_id.0.as_ref())
                        {
                            Ok(()) => responder.respond(acp1::KillTerminalResponse::new()),
                            Err(error) => responder.respond_with_internal_error(error),
                        }
                    }
                },
                on_receive_request!(),
            )
            .on_receive_request(
                move |request: acp1::ReleaseTerminalRequest,
                      responder: Responder<acp1::ReleaseTerminalResponse>,
                      _connection: ConnectionTo<Agent>| {
                    let shared = terminal_release_shared.clone();
                    async move {
                        let session_id = shared.root_session_id(&request.session_id.to_string());
                        let terminal_id = request.terminal_id.to_string();
                        match shared.terminals.release(&session_id, &terminal_id) {
                            Ok(()) => {
                                shared.emit(
                                    &session_id,
                                    TurnEventBody::TerminalUpsert {
                                        terminal_id,
                                        patch: tethys_schema::thread::Patch::Clear,
                                    },
                                );
                                responder.respond(acp1::ReleaseTerminalResponse::new())
                            }
                            Err(error) => responder.respond_with_internal_error(error),
                        }
                    }
                },
                on_receive_request!(),
            )
            .on_receive_request(
                move |request: acp1::CreateElicitationRequest,
                      responder: Responder<acp1::CreateElicitationResponse>,
                      connection: ConnectionTo<Agent>| {
                    let shared = elicitation_shared.clone();
                    async move {
                        let Some(session_id) = elicitation_session_v1(&request) else {
                            responder.respond(v1_elicitation_response(
                                tethys_schema::elicitation::ElicitationResponse::without_values(
                                    String::new(),
                                    tethys_schema::elicitation::ElicitationOutcome::Cancelled,
                                ),
                            ))?;
                            return Ok(());
                        };
                        let normalized = crate::elicitation::from_sdk_v1(&request)
                            .or_else(|| {
                                crate::elicitation::from_sdk_v1_url(&request).map(|url| {
                                    tethys_schema::elicitation::ElicitationRequest {
                                        req_id: String::new(),
                                        title: request.message.clone(),
                                        description: None,
                                        url: Some(url),
                                        fields: Vec::new(),
                                    }
                                })
                            })
                            .unwrap_or_else(|| tethys_schema::elicitation::ElicitationRequest {
                                req_id: String::new(),
                                title: request.message.clone(),
                                description: None,
                                url: None,
                                fields: Vec::new(),
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
                            responder.respond(v1_elicitation_response(response))
                        })?;
                        Ok(())
                    }
                },
                on_receive_request!(),
            )
            .on_receive_notification(
                move |notification: acp1::AgentNotification, connection: ConnectionTo<Agent>| {
                    let shared = extension_notification_shared.clone();
                    async move {
                        let acp1::AgentNotification::ExtNotification(notification) = notification
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
                move |request: acp1::AgentRequest,
                      responder: Responder<serde_json::Value>,
                      connection: ConnectionTo<Agent>| {
                    let shared = extension_request_shared.clone();
                    async move {
                        let acp1::AgentRequest::ExtMethodRequest(request) = request else {
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
                move |connection: ConnectionTo<Agent>| async move {
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
            tracing::debug!(%error, "ACP v1 connection ended");
        }
        connection_shared.close_connection();
        closed_task.cancel();
    });

    let wire = handle_rx.await.map_err(|_| {
        ConnectionError::Transport("connection ended before initialize".to_string())
    })?;
    let response = wire
        .send_request(
            acp1::InitializeRequest::new(ProtocolVersion::V1)
                .client_info(acp1::Implementation::new(
                    client_name,
                    env!("CARGO_PKG_VERSION"),
                ))
                .client_capabilities(v1_client_capabilities(
                    elicitation_enabled,
                    terminal_auth_enabled,
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

    let info = response
        .agent_info
        .as_ref()
        .map(|info| agent_info(&info.name, info.version.as_str(), info.title.as_deref()))
        .unwrap_or_else(|| agent_info("unknown", "", None));

    let terminal_auth = terminal_auth_v1(&response.auth_methods);
    let auth_method_meta = auth_method_meta_v1(&response.auth_methods);
    let auth_status_supported = response
        .agent_capabilities
        .meta
        .as_ref()
        .is_some_and(|meta| meta.contains_key("authStatus"));
    shared
        .auth_status_supported
        .store(auth_status_supported, Ordering::Release);
    let mut capabilities = capabilities_v1(&response.agent_capabilities, elicitation_enabled);
    capabilities.provider_extensions = shared.provider_extension_capabilities(
        response.meta.as_ref(),
        capabilities.provider_extensions.provider_routing,
        auth_status_supported,
    );
    capabilities.provider_extensions.gateway_auth &= response
        .auth_methods
        .iter()
        .any(|method| method.id().0.as_ref() == "gateway");
    Ok(AcpConnection {
        info,
        capabilities,
        auth_methods: auth_methods_v1(&response.auth_methods),
        terminal_auth,
        auth_method_meta,
        agent_meta: response.meta.clone(),
        integration_id: options
            .integration
            .as_ref()
            .map(|integration| integration.id.clone()),
        protocol: AcpProtocol::V1,
        wire: Wire::V1(wire),
        shared,
        shutdown,
        closed,
    })
}
