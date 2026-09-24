use super::wire::*;
use super::*;

#[async_trait]
impl AgentConnection for AcpConnection {
    fn info(&self) -> &AgentInfo {
        &self.info
    }

    fn capabilities(&self) -> &NormalizedCapabilities {
        &self.capabilities
    }

    fn auth_methods(&self) -> &[AuthMethodView] {
        &self.auth_methods
    }

    async fn new_session(&self, request: NewSession) -> Result<SessionHandle, ConnectionError> {
        match &self.wire {
            Wire::V1(connection) => {
                let cwd = request.cwd.clone();
                let additional_directories = request.additional_directories.clone();
                let response = connection
                    .send_request(
                        acp1::NewSessionRequest::new(request.cwd)
                            .additional_directories(additional_directories.clone())
                            .mcp_servers(v1_mcp_servers(
                                &request.mcp_servers,
                                &self.capabilities.mcp,
                            )),
                    )
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                let id = SessionId::new(response.session_id.to_string());
                self.shared.register(&id.0);
                self.shared
                    .set_session_roots(&id.0, cwd, additional_directories);
                let mut config_options =
                    v1_session_config(response.modes.as_ref(), response.config_options.as_ref());
                self.shared.enrich_config_options(&mut config_options);
                Ok(SessionHandle { id, config_options })
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => {
                let cwd = request.cwd.clone();
                let additional_directories = request.additional_directories.clone();
                let response = connection
                    .send_request(
                        acp2::NewSessionRequest::new(request.cwd)
                            .additional_directories(additional_directories.clone())
                            .mcp_servers(v2_mcp_servers(
                                &request.mcp_servers,
                                &self.capabilities.mcp,
                            )),
                    )
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                let id = SessionId::new(response.session_id.to_string());
                self.shared.register(&id.0);
                self.shared
                    .set_session_roots(&id.0, cwd, additional_directories);
                let mut config_options = response
                    .config_options
                    .iter()
                    .map(crate::map_v2::config_option)
                    .collect::<Vec<_>>();
                self.shared.enrich_config_options(&mut config_options);
                Ok(SessionHandle { id, config_options })
            }
        }
    }

    async fn fork_session(
        &self,
        source: &SessionId,
        request: NewSession,
    ) -> Result<SessionHandle, ConnectionError> {
        if !self.capabilities.session_fork {
            return Err(ConnectionError::Unsupported("session_fork"));
        }
        match &self.wire {
            Wire::V1(connection) => {
                let cwd = request.cwd.clone();
                let additional_directories = request.additional_directories.clone();
                let response = connection
                    .send_request(
                        acp1::ForkSessionRequest::new(source.0.clone(), request.cwd)
                            .additional_directories(additional_directories.clone())
                            .mcp_servers(v1_mcp_servers(
                                &request.mcp_servers,
                                &self.capabilities.mcp,
                            )),
                    )
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                let id = SessionId::new(response.session_id.to_string());
                self.shared.register(&id.0);
                self.shared
                    .set_session_roots(&id.0, cwd, additional_directories);
                let mut config_options =
                    v1_session_config(response.modes.as_ref(), response.config_options.as_ref());
                self.shared.enrich_config_options(&mut config_options);
                Ok(SessionHandle { id, config_options })
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => {
                let cwd = request.cwd.clone();
                let additional_directories = request.additional_directories.clone();
                let response = connection
                    .send_request(
                        acp2::ForkSessionRequest::new(source.0.clone(), request.cwd)
                            .additional_directories(additional_directories.clone())
                            .mcp_servers(v2_mcp_servers(
                                &request.mcp_servers,
                                &self.capabilities.mcp,
                            )),
                    )
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                let id = SessionId::new(response.session_id.to_string());
                self.shared.register(&id.0);
                self.shared
                    .set_session_roots(&id.0, cwd, additional_directories);
                let mut config_options = response
                    .config_options
                    .iter()
                    .map(crate::map_v2::config_option)
                    .collect::<Vec<_>>();
                self.shared.enrich_config_options(&mut config_options);
                Ok(SessionHandle { id, config_options })
            }
        }
    }

    async fn load_session(&self, request: ResumeSession) -> Result<SessionHandle, ConnectionError> {
        let session_id = request.session_id.0.clone();
        let cwd = request.cwd.clone();
        let additional_directories = request.additional_directories.clone();
        self.shared.set_replaying(&session_id, true);
        let result = match &self.wire {
            Wire::V1(connection) => {
                if !self.capabilities.load_session {
                    Err(ConnectionError::Unsupported("load_session"))
                } else {
                    let response = connection
                        .send_request(
                            acp1::LoadSessionRequest::new(session_id.clone(), request.cwd)
                                .mcp_servers(v1_mcp_servers(
                                    &request.mcp_servers,
                                    &self.capabilities.mcp,
                                ))
                                .additional_directories(additional_directories.clone()),
                        )
                        .block_task()
                        .await
                        .map_err(map_sdk_error);
                    response.map(|response| {
                        self.shared.register(&session_id);
                        self.shared.set_session_roots(
                            &session_id,
                            cwd.clone(),
                            additional_directories.clone(),
                        );
                        let mut config_options = v1_session_config(
                            response.modes.as_ref(),
                            response.config_options.as_ref(),
                        );
                        self.shared.enrich_config_options(&mut config_options);
                        SessionHandle {
                            id: request.session_id.clone(),
                            config_options,
                        }
                    })
                }
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(_) => Err(ConnectionError::Unsupported("load_session")),
        };
        self.shared.set_replaying(&session_id, false);
        result
    }

    async fn resume_session(
        &self,
        request: ResumeSession,
    ) -> Result<SessionHandle, ConnectionError> {
        let session_id = request.session_id.0.clone();
        let cwd = request.cwd.clone();
        let additional_directories = request.additional_directories.clone();
        self.shared.set_replaying(&session_id, true);
        let result = match &self.wire {
            Wire::V1(connection) => {
                if !self.capabilities.resume {
                    Err(ConnectionError::Unsupported("resume_session"))
                } else {
                    let response = connection
                        .send_request(
                            acp1::ResumeSessionRequest::new(session_id.clone(), request.cwd)
                                .additional_directories(additional_directories.clone())
                                .mcp_servers(v1_mcp_servers(
                                    &request.mcp_servers,
                                    &self.capabilities.mcp,
                                )),
                        )
                        .block_task()
                        .await
                        .map_err(map_sdk_error);
                    response.map(|response| {
                        self.shared.register(&session_id);
                        self.shared.set_session_roots(
                            &session_id,
                            cwd.clone(),
                            additional_directories.clone(),
                        );
                        let mut config_options = v1_session_config(
                            response.modes.as_ref(),
                            response.config_options.as_ref(),
                        );
                        self.shared.enrich_config_options(&mut config_options);
                        SessionHandle {
                            id: request.session_id.clone(),
                            config_options,
                        }
                    })
                }
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => {
                if !self.capabilities.resume {
                    Err(ConnectionError::Unsupported("resume_session"))
                } else {
                    let mut resume =
                        acp2::ResumeSessionRequest::new(session_id.clone(), request.cwd)
                            .additional_directories(additional_directories.clone())
                            .mcp_servers(v2_mcp_servers(
                                &request.mcp_servers,
                                &self.capabilities.mcp,
                            ));
                    if request.replay {
                        resume = resume
                            .replay_from(acp2::ReplayFrom::Start(acp2::ReplayFromStart::default()));
                    }
                    let response = connection
                        .send_request(resume)
                        .block_task()
                        .await
                        .map_err(map_sdk_error);
                    response.map(|response| {
                        self.shared.register(&session_id);
                        self.shared.set_session_roots(
                            &session_id,
                            cwd.clone(),
                            additional_directories.clone(),
                        );
                        let mut config_options = response
                            .config_options
                            .iter()
                            .map(crate::map_v2::config_option)
                            .collect::<Vec<_>>();
                        self.shared.enrich_config_options(&mut config_options);
                        SessionHandle {
                            id: request.session_id.clone(),
                            config_options,
                        }
                    })
                }
            }
        };
        self.shared.set_replaying(&session_id, false);
        result
    }

    async fn close_session(&self, id: &SessionId) -> Result<(), ConnectionError> {
        match &self.wire {
            Wire::V1(connection) => {
                if !self.capabilities.close_session {
                    return Err(ConnectionError::Unsupported("close_session"));
                }
                connection
                    .send_request(acp1::CloseSessionRequest::new(id.0.clone()))
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                self.shared.close_session(&id.0);
                Ok(())
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => {
                if !self.capabilities.close_session {
                    return Err(ConnectionError::Unsupported("close_session"));
                }
                connection
                    .send_request(acp2::CloseSessionRequest::new(id.0.clone()))
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                self.shared.close_session(&id.0);
                Ok(())
            }
        }
    }

    async fn prompt(
        &self,
        id: &SessionId,
        blocks: Vec<ContentBlock>,
    ) -> Result<(), ConnectionError> {
        match &self.wire {
            Wire::V1(connection) => {
                let prompt_meta = self.shared.prompt_metadata(&id.0, self.agent_meta.as_ref());
                let blocks = blocks
                    .into_iter()
                    .map(|block| to_v1_block(block, &self.capabilities))
                    .collect::<Result<Vec<_>, _>>()?;
                self.shared.emit(
                    &id.0,
                    map::state_changed(tethys_schema::thread::SessionState::Running),
                );
                let response = connection
                    .send_request(acp1::PromptRequest::new(id.0.clone(), blocks).meta(prompt_meta))
                    .block_task()
                    .await
                    .map_err(map_sdk_error);
                self.shared.clear_prompt_metadata(&id.0);
                let response = response?;
                for event in self.shared.prompt_response_events(&response) {
                    self.shared.emit(&id.0, event);
                }
                self.shared.emit(
                    &id.0,
                    map::state_changed(tethys_schema::thread::SessionState::Idle {
                        stop_reason: Some(map::stop_reason(&response.stop_reason)),
                    }),
                );
                Ok(())
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => {
                let prompt_meta = self.shared.prompt_metadata(&id.0, self.agent_meta.as_ref());
                let blocks = blocks
                    .into_iter()
                    .map(|block| to_v2_block(block, &self.capabilities))
                    .collect::<Result<Vec<_>, _>>()?;
                let response = connection
                    .send_request(acp2::PromptRequest::new(id.0.clone(), blocks).meta(prompt_meta))
                    .block_task()
                    .await
                    .map_err(map_sdk_error);
                self.shared.clear_prompt_metadata(&id.0);
                let response = response?;
                for event in self.shared.prompt_response_events(&response) {
                    self.shared.emit(&id.0, event);
                }
                Ok(())
            }
        }
    }

    async fn provider_control(
        &self,
        id: &SessionId,
        control: ProviderControl,
    ) -> Result<ProviderControlResult, ConnectionError> {
        self.send_session_control(id, control).await
    }

    async fn cancel(&self, id: &SessionId) -> Result<(), ConnectionError> {
        self.shared.cancel_extension_requests(&id.0);
        match &self.wire {
            Wire::V1(connection) => connection
                .send_notification(acp1::CancelNotification::new(id.0.clone()))
                .map_err(map_sdk_error),
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => connection
                .send_notification(acp2::CancelSessionNotification::new(id.0.clone()))
                .map_err(map_sdk_error),
        }
    }

    async fn respond_extension(
        &self,
        session_id: &SessionId,
        request_id: &str,
        response: serde_json::Value,
    ) -> Result<(), ConnectionError> {
        self.shared
            .respond_extension(session_id, request_id, response)
    }

    async fn list_sessions_page(
        &self,
        cwd: &std::path::Path,
        cursor: Option<&str>,
    ) -> Result<(Vec<SessionSummary>, Option<String>), ConnectionError> {
        match &self.wire {
            Wire::V1(connection) => {
                if !self.capabilities.list_sessions {
                    return Err(ConnectionError::Unsupported("list_sessions"));
                }
                let response = connection
                    .send_request(
                        acp1::ListSessionsRequest::new()
                            .cwd(cwd.to_path_buf())
                            .cursor(cursor.map(str::to_string)),
                    )
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                let page = response
                    .sessions
                    .into_iter()
                    .map(|session| SessionSummary {
                        id: SessionId::new(session.session_id.to_string()),
                        cwd: session.cwd,
                        title: session.title,
                        updated_at: session.updated_at,
                    })
                    .collect::<Vec<_>>();
                Ok((page, response.next_cursor))
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => {
                if !self.capabilities.list_sessions {
                    return Err(ConnectionError::Unsupported("list_sessions"));
                }
                let response = connection
                    .send_request(
                        acp2::ListSessionsRequest::new()
                            .cwd(cwd.to_path_buf())
                            .cursor(
                                cursor
                                    .map(|cursor| acp2::SessionListCursor::new(cursor.to_string())),
                            ),
                    )
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                let page = response
                    .sessions
                    .into_iter()
                    .map(|session| SessionSummary {
                        id: SessionId::new(session.session_id.to_string()),
                        cwd: session.cwd.0,
                        title: session.title,
                        updated_at: session.updated_at,
                    })
                    .collect::<Vec<_>>();
                Ok((
                    page,
                    response
                        .next_cursor
                        .map(|cursor| cursor.0.as_ref().to_string()),
                ))
            }
        }
    }

    async fn set_config_option(
        &self,
        id: &SessionId,
        config_id: &str,
        value: serde_json::Value,
    ) -> Result<Vec<ConfigOption>, ConnectionError> {
        let config_id = config_id.to_string();
        match &self.wire {
            Wire::V1(connection) => {
                let value = match value {
                    serde_json::Value::Bool(value) => {
                        acp1::SessionConfigOptionValue::boolean(value)
                    }
                    serde_json::Value::String(value) => {
                        acp1::SessionConfigOptionValue::value_id(value)
                    }
                    _ => return Err(ConnectionError::Unsupported("config_option_value")),
                };
                let response = connection
                    .send_request(acp1::SetSessionConfigOptionRequest::new(
                        id.0.clone(),
                        config_id.clone(),
                        value,
                    ))
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                Ok(response
                    .config_options
                    .iter()
                    .map(map::config_option)
                    .collect())
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => {
                let value = match value {
                    serde_json::Value::Bool(value) => {
                        acp2::SessionConfigOptionValue::boolean(value)
                    }
                    serde_json::Value::String(value) => acp2::SessionConfigOptionValue::id(value),
                    _ => return Err(ConnectionError::Unsupported("config_option_value")),
                };
                let response = connection
                    .send_request(acp2::SetSessionConfigOptionRequest::new(
                        id.0.clone(),
                        config_id.clone(),
                        value,
                    ))
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                Ok(response
                    .config_options
                    .iter()
                    .map(crate::map_v2::config_option)
                    .collect())
            }
        }
    }

    async fn set_mode(&self, id: &SessionId, mode_id: &str) -> Result<(), ConnectionError> {
        match &self.wire {
            Wire::V1(connection) => {
                connection
                    .send_request(acp1::SetSessionModeRequest::new(
                        id.0.clone(),
                        mode_id.to_string(),
                    ))
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                Ok(())
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(_) => Err(ConnectionError::Unsupported("session/set_mode")),
        }
    }

    async fn login(
        &self,
        method_id: &str,
        meta: Option<serde_json::Map<String, serde_json::Value>>,
    ) -> Result<(), ConnectionError> {
        let method = self
            .auth_methods
            .iter()
            .find(|method| method.id == method_id)
            .ok_or(ConnectionError::Unsupported("unknown_auth_method"))?;
        if !matches!(method.shape, AuthMethodShape::AgentAuth) {
            return Err(ConnectionError::Unsupported("terminal_auth"));
        }
        match &self.wire {
            Wire::V1(connection) => {
                connection
                    .send_request(
                        acp1::AuthenticateRequest::new(acp1::AuthMethodId::new(method_id))
                            .meta(meta.clone()),
                    )
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                Ok(())
            }
            #[cfg(feature = "acp-v2")]
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => {
                connection
                    .send_request(
                        acp2::LoginAuthRequest::new(acp2::AuthMethodId::new(method_id)).meta(meta),
                    )
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                Ok(())
            }
        }
    }

    async fn logout(&self) -> Result<(), ConnectionError> {
        if !self.capabilities.logout {
            return Err(ConnectionError::Unsupported("logout"));
        }
        match &self.wire {
            Wire::V1(connection) => {
                connection
                    .send_request(acp1::LogoutRequest::new())
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                Ok(())
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => {
                connection
                    .send_request(acp2::LogoutAuthRequest::new())
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                Ok(())
            }
        }
    }

    fn events(&self, id: &SessionId) -> EventStream {
        let receiver = self.shared.subscribe(&id.0);
        Box::pin(futures::stream::unfold(
            receiver,
            |mut receiver| async move {
                loop {
                    match receiver.recv().await {
                        Ok(event) => return Some((Ok(event), receiver)),
                        Err(broadcast::error::RecvError::Lagged(skipped)) => {
                            tracing::warn!(skipped, "session event subscriber lagged");
                        }
                        Err(broadcast::error::RecvError::Closed) => return None,
                    }
                }
            },
        ))
    }

    fn session_deleter(&self) -> Option<&dyn SessionDeleter> {
        self.capabilities.delete_session.then_some(self)
    }
}

#[async_trait]
impl SessionDeleter for AcpConnection {
    async fn delete_session(&self, id: &SessionId) -> Result<(), ConnectionError> {
        if !self.capabilities.delete_session {
            return Err(ConnectionError::Unsupported("delete_session"));
        }
        match &self.wire {
            Wire::V1(connection) => {
                connection
                    .send_request(acp1::DeleteSessionRequest::new(id.0.clone()))
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => {
                connection
                    .send_request(acp2::DeleteSessionRequest::new(id.0.clone()))
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
            }
        }
        self.shared.close_session(&id.0);
        Ok(())
    }
}
