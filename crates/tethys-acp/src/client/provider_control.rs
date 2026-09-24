use super::wire::*;
use super::*;

impl AcpConnection {
    pub fn protocol(&self) -> AcpProtocol {
        self.protocol
    }

    pub(super) async fn list_provider_routes(&self) -> Result<Vec<ProviderRoute>, ConnectionError> {
        if !self.capabilities.provider_extensions.provider_routing {
            return Err(ConnectionError::Unsupported("provider_routing"));
        }
        let response = match &self.wire {
            Wire::V1(connection) => serde_json::to_value(
                connection
                    .send_request(acp1::ListProvidersRequest::new())
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?
                    .providers,
            ),
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => serde_json::to_value(
                connection
                    .send_request(acp2::ListProvidersRequest::new())
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?
                    .providers,
            ),
        }
        .map_err(|error| ConnectionError::Protocol(error.to_string()))?;
        provider_routes_from_value(response)
    }

    pub(super) async fn set_provider_route(
        &self,
        provider_id: String,
        api_type: String,
        base_url: String,
        headers: Vec<tethys_schema::thread::ProviderHeader>,
    ) -> Result<(), ConnectionError> {
        if !self.capabilities.provider_extensions.provider_routing {
            return Err(ConnectionError::Unsupported("provider_routing"));
        }
        let headers = headers
            .into_iter()
            .map(|header| (header.name, header.value))
            .collect::<HashMap<_, _>>();
        match &self.wire {
            Wire::V1(connection) => {
                let api_type = serde_json::from_value(serde_json::Value::String(api_type))
                    .map_err(|error| ConnectionError::Protocol(error.to_string()))?;
                connection
                    .send_request(
                        acp1::SetProviderRequest::new(provider_id, api_type, base_url)
                            .headers(headers),
                    )
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => {
                let api_type = serde_json::from_value(serde_json::Value::String(api_type))
                    .map_err(|error| ConnectionError::Protocol(error.to_string()))?;
                connection
                    .send_request(
                        acp2::SetProviderRequest::new(provider_id, api_type, base_url)
                            .headers(headers),
                    )
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
            }
        }
        Ok(())
    }

    pub(super) async fn disable_provider_route(
        &self,
        provider_id: String,
    ) -> Result<(), ConnectionError> {
        if !self.capabilities.provider_extensions.provider_routing {
            return Err(ConnectionError::Unsupported("provider_routing"));
        }
        if self
            .list_provider_routes()
            .await?
            .iter()
            .any(|provider| provider.provider_id == provider_id && provider.required)
        {
            return Err(ConnectionError::Protocol(
                "required provider cannot be disabled".into(),
            ));
        }
        match &self.wire {
            Wire::V1(connection) => {
                connection
                    .send_request(acp1::DisableProviderRequest::new(provider_id))
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => {
                connection
                    .send_request(acp2::DisableProviderRequest::new(provider_id))
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
            }
        }
        Ok(())
    }

    pub(super) async fn send_session_control(
        &self,
        id: &SessionId,
        control: ProviderControl,
    ) -> Result<ProviderControlResult, ConnectionError> {
        let control = match control {
            ProviderControl::ListProviders => {
                return Ok(ProviderControlResult::Providers {
                    providers: self.list_provider_routes().await?,
                });
            }
            ProviderControl::SetProvider {
                provider_id,
                api_type,
                base_url,
                headers,
            } => {
                self.set_provider_route(provider_id, api_type, base_url, headers)
                    .await?;
                return Ok(ProviderControlResult::ProviderUpdated);
            }
            ProviderControl::DisableProvider { provider_id } => {
                self.disable_provider_route(provider_id).await?;
                return Ok(ProviderControlResult::ProviderDisabled);
            }
            control => control,
        };
        let capabilities = &self.capabilities.provider_extensions;
        enum Request {
            Goal(GoalControlRequest),
            Steering(SteeringRequest),
            Stop(AsyncTaskStopRequest),
        }
        enum ResultKind {
            Goal,
            Steering,
            Stop,
        }
        let (request, result_kind) = match control {
            ProviderControl::Goal { action, objective } => {
                let action_name = match action {
                    GoalAction::Set => "set",
                    GoalAction::Pause => "pause",
                    GoalAction::Resume => "resume",
                    GoalAction::Clear => "clear",
                };
                if !capabilities
                    .goal_actions
                    .iter()
                    .any(|value| value == action_name)
                {
                    return Err(ConnectionError::Unsupported("session_goal_action"));
                }
                let objective = match (action, objective) {
                    (GoalAction::Set, Some(value)) if !value.trim().is_empty() => Some(value),
                    (GoalAction::Set, _) => {
                        return Err(ConnectionError::Protocol(
                            "setting a session goal requires an objective".into(),
                        ));
                    }
                    (_, None) => None,
                    (_, Some(_)) => {
                        return Err(ConnectionError::Protocol(
                            "only setting a session goal accepts an objective".into(),
                        ));
                    }
                };
                (
                    Request::Goal(GoalControlRequest {
                        session_id: id.0.clone(),
                        action: action_name.to_string(),
                        objective,
                    }),
                    ResultKind::Goal,
                )
            }
            ProviderControl::Steer { prompt } => {
                if !capabilities.steering {
                    return Err(ConnectionError::Unsupported("session_steering"));
                }
                let prompt = match &self.wire {
                    Wire::V1(_) => prompt
                        .into_iter()
                        .map(|block| to_v1_block(block, &self.capabilities))
                        .map(|block| {
                            block.and_then(|block| {
                                serde_json::to_value(block)
                                    .map_err(|e| ConnectionError::Protocol(e.to_string()))
                            })
                        })
                        .collect::<Result<Vec<_>, _>>()?,
                    #[cfg(feature = "acp-v2")]
                    Wire::V2(_) => prompt
                        .into_iter()
                        .map(|block| to_v2_block(block, &self.capabilities))
                        .map(|block| {
                            block.and_then(|block| {
                                serde_json::to_value(block)
                                    .map_err(|e| ConnectionError::Protocol(e.to_string()))
                            })
                        })
                        .collect::<Result<Vec<_>, _>>()?,
                };
                (
                    Request::Steering(SteeringRequest {
                        session_id: id.0.clone(),
                        prompt,
                    }),
                    ResultKind::Steering,
                )
            }
            ProviderControl::StopAsyncTask { async_task_id } => {
                if !capabilities.async_tasks {
                    return Err(ConnectionError::Unsupported("async_task_stop"));
                }
                if async_task_id.is_empty() || async_task_id.len() > 1024 {
                    return Err(ConnectionError::Protocol("invalid async task id".into()));
                }
                (
                    Request::Stop(AsyncTaskStopRequest {
                        session_id: id.0.clone(),
                        async_task_id,
                    }),
                    ResultKind::Stop,
                )
            }
            ProviderControl::ListProviders
            | ProviderControl::SetProvider { .. }
            | ProviderControl::DisableProvider { .. } => {
                return Err(ConnectionError::Unsupported("provider_routing"));
            }
        };

        let response = match (&self.wire, request) {
            (Wire::V1(connection), Request::Goal(request)) => connection
                .send_request(request)
                .block_task()
                .await
                .map_err(map_sdk_error)?,
            (Wire::V1(connection), Request::Steering(request)) => connection
                .send_request(request)
                .block_task()
                .await
                .map_err(map_sdk_error)?,
            (Wire::V1(connection), Request::Stop(request)) => connection
                .send_request(request)
                .block_task()
                .await
                .map_err(map_sdk_error)?,
            #[cfg(feature = "acp-v2")]
            (Wire::V2(connection), Request::Goal(request)) => connection
                .send_request(request)
                .block_task()
                .await
                .map_err(map_sdk_error)?,
            #[cfg(feature = "acp-v2")]
            (Wire::V2(connection), Request::Steering(request)) => connection
                .send_request(request)
                .block_task()
                .await
                .map_err(map_sdk_error)?,
            #[cfg(feature = "acp-v2")]
            (Wire::V2(connection), Request::Stop(request)) => connection
                .send_request(request)
                .block_task()
                .await
                .map_err(map_sdk_error)?,
        };
        match result_kind {
            ResultKind::Goal => Ok(ProviderControlResult::GoalUpdated),
            ResultKind::Steering => {
                let outcome = response
                    .get("outcome")
                    .and_then(serde_json::Value::as_str)
                    .ok_or_else(|| ConnectionError::Protocol("invalid steering response".into()))?;
                let outcome = match outcome {
                    "injected" => SteeringOutcome::Injected,
                    "startedNewTurn" => SteeringOutcome::StartedNewTurn,
                    "failed" => SteeringOutcome::Failed,
                    _ => {
                        return Err(ConnectionError::Protocol("unknown steering outcome".into()));
                    }
                };
                Ok(ProviderControlResult::Steering { outcome })
            }
            ResultKind::Stop => {
                let stopped = response
                    .get("stopped")
                    .and_then(serde_json::Value::as_bool)
                    .ok_or_else(|| {
                        ConnectionError::Protocol("invalid async-task response".into())
                    })?;
                Ok(ProviderControlResult::AsyncTaskStopped { stopped })
            }
        }
    }
}

pub(super) fn provider_routes_from_value(
    value: serde_json::Value,
) -> Result<Vec<ProviderRoute>, ConnectionError> {
    let providers = value
        .as_array()
        .ok_or_else(|| ConnectionError::Protocol("invalid providers/list response".into()))?;
    providers
        .iter()
        .map(|provider| {
            let provider_id = provider
                .get("providerId")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| ConnectionError::Protocol("provider id missing".into()))?;
            let supported = provider
                .get("supported")
                .and_then(serde_json::Value::as_array)
                .map(|values| {
                    values
                        .iter()
                        .filter_map(serde_json::Value::as_str)
                        .map(str::to_owned)
                        .collect()
                })
                .unwrap_or_default();
            let current = provider
                .get("current")
                .filter(|value| !value.is_null())
                .map(|value| {
                    Ok(ProviderRouteConfig {
                        api_type: value
                            .get("apiType")
                            .and_then(serde_json::Value::as_str)
                            .ok_or_else(|| {
                                ConnectionError::Protocol("provider api type missing".into())
                            })?
                            .to_owned(),
                        base_url: value
                            .get("baseUrl")
                            .and_then(serde_json::Value::as_str)
                            .ok_or_else(|| {
                                ConnectionError::Protocol("provider base URL missing".into())
                            })?
                            .to_owned(),
                        metadata: value
                            .get("_meta")
                            .filter(|meta| !meta.is_null())
                            .map(serde_json::Value::to_string),
                    })
                })
                .transpose()?;
            Ok(ProviderRoute {
                provider_id: provider_id.to_owned(),
                supported,
                required: provider
                    .get("required")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false),
                current,
                metadata: provider
                    .get("_meta")
                    .filter(|meta| !meta.is_null())
                    .map(serde_json::Value::to_string),
            })
        })
        .collect()
}
