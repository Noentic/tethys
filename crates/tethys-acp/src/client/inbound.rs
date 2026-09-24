use super::wire::*;
use super::*;

impl Shared {
    pub(super) fn new(options: &AcpConnectOptions) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            synthetic: Mutex::new(HashMap::new()),
            replaying: Mutex::new(HashMap::new()),
            resolver: Arc::clone(&options.services.permission),
            elicitation_resolver: options.services.elicitation.clone(),
            permission_seq: AtomicU32::new(0),
            elicitation_seq: AtomicU32::new(0),
            session_roots: Mutex::new(HashMap::new()),
            subagent_roots: Mutex::new(HashMap::new()),
            terminals: TerminalHost::default(),
            provider_id: options
                .integration
                .as_ref()
                .map(|integration| integration.id.clone())
                .unwrap_or_else(|| "custom-acp".to_string()),
            client_capabilities_meta: options
                .integration
                .as_ref()
                .map(|integration| integration.client_capabilities_meta.clone())
                .unwrap_or_default(),
            gateway_auth_enabled: options
                .integration
                .as_ref()
                .is_some_and(|integration| integration.gateway_auth),
            tethys_commands: options
                .integration
                .as_ref()
                .map(|integration| integration.tethys_commands.clone())
                .unwrap_or_default(),
            extension_methods: options
                .integration
                .as_ref()
                .map(|integration| integration.extension_methods.iter().cloned().collect())
                .unwrap_or_default(),
            extension_request_handler: options
                .integration
                .as_ref()
                .and_then(|integration| integration.extension_request_handler.clone()),
            extension_notification_handler: options
                .integration
                .as_ref()
                .and_then(|integration| integration.extension_notification_handler.clone()),
            session_update_handler: options
                .integration
                .as_ref()
                .and_then(|integration| integration.session_update_handler.clone()),
            config_options_handler: options
                .integration
                .as_ref()
                .and_then(|integration| integration.config_options_handler.clone()),
            permission_metadata_handler: options
                .integration
                .as_ref()
                .and_then(|integration| integration.permission_metadata_handler.clone()),
            prompt_response_handler: options
                .integration
                .as_ref()
                .and_then(|integration| integration.prompt_response_handler.clone()),
            prompt_metadata_handler: options
                .integration
                .as_ref()
                .and_then(|integration| integration.prompt_metadata_handler.clone()),
            extension_seq: AtomicU32::new(0),
            prompt_metadata_seq: AtomicU32::new(0),
            active_prompt_metadata: Mutex::new(HashMap::new()),
            auth_status_supported: AtomicBool::new(false),
            provider_auth_status: Mutex::new(None),
            pending_extensions: Mutex::new(HashMap::new()),
        }
    }

    pub(super) fn emit(&self, session_id: &str, body: TurnEventBody) {
        let replayed = self
            .replaying
            .lock()
            .get(session_id)
            .copied()
            .unwrap_or(false);
        let event = ConnectionEvent { body, replayed };
        let mut sessions = self.sessions.lock();
        let channel = sessions
            .entry(session_id.to_string())
            .or_insert_with(|| SessionChannel {
                tx: broadcast::channel(1024).0,
                buffer: Vec::new(),
                taken: false,
            });
        if channel.taken {
            let _ = channel.tx.send(event);
        } else {
            channel.buffer.push(event);
        }
    }

    pub(super) fn enrich_config_options(&self, options: &mut [ConfigOption]) {
        if let Some(handler) = &self.config_options_handler {
            handler(options);
        }
    }

    pub(super) fn next_request_id(&self) -> String {
        format!(
            "perm-{}",
            self.permission_seq.fetch_add(1, Ordering::Relaxed) + 1
        )
    }

    pub(super) fn next_elicitation_id(&self) -> String {
        format!(
            "elicit-{}",
            self.elicitation_seq.fetch_add(1, Ordering::Relaxed) + 1
        )
    }

    pub(super) fn next_extension_id(&self) -> String {
        format!(
            "extension-{}",
            self.extension_seq.fetch_add(1, Ordering::Relaxed) + 1
        )
    }

    pub(super) fn prompt_metadata(
        &self,
        session_id: &str,
        agent_meta: Option<&serde_json::Map<String, serde_json::Value>>,
    ) -> Option<serde_json::Map<String, serde_json::Value>> {
        let handler = self.prompt_metadata_handler.as_ref()?;
        let request_id = format!(
            "tethys-file-report-{}",
            self.prompt_metadata_seq.fetch_add(1, Ordering::Relaxed) + 1
        );
        let meta = handler(session_id, &request_id, agent_meta)?;
        self.active_prompt_metadata
            .lock()
            .insert(session_id.to_string(), request_id);
        Some(meta)
    }

    pub(super) fn clear_prompt_metadata(&self, session_id: &str) {
        self.active_prompt_metadata.lock().remove(session_id);
    }

    pub(super) fn provider_auth_status(&self) -> Option<ProviderAuthStatus> {
        self.provider_auth_status.lock().clone()
    }

    pub(super) fn provider_extension_capabilities(
        &self,
        agent_meta: Option<&serde_json::Map<String, serde_json::Value>>,
        provider_routing: bool,
        auth_status: bool,
    ) -> tethys_schema::connection::ProviderExtensionCapabilities {
        let goal = agent_meta.and_then(|meta| meta.get("goal"));
        let goal_actions = if self.extension_methods.contains("_session/goal")
            && goal
                .and_then(|goal| goal.get("controlMethod"))
                .and_then(|v| v.as_str())
                == Some("_session/goal")
        {
            goal.and_then(|goal| goal.get("actions"))
                .and_then(serde_json::Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(serde_json::Value::as_str)
                .filter(|action| matches!(*action, "set" | "pause" | "resume" | "clear"))
                .map(str::to_owned)
                .collect()
        } else {
            Vec::new()
        };
        let steering = self.extension_methods.contains("_session/steering")
            && agent_meta
                .and_then(|meta| meta.get("steering"))
                .and_then(|meta| meta.get("supported"))
                .and_then(serde_json::Value::as_bool)
                == Some(true);
        let async_tasks = self.extension_methods.contains("_session/async_task/stop")
            && meta_has_air_capability(agent_meta, "asyncTasks")
            && meta_has_air_capability(Some(&self.client_capabilities_meta), "asyncTasks");
        let native_subagents = meta_has_air_capability(agent_meta, "nativeSubagentSessions")
            && meta_has_air_capability(
                Some(&self.client_capabilities_meta),
                "nativeSubagentSessions",
            );
        let file_change_report = self.prompt_metadata_handler.is_some()
            && meta_has_air_capability(agent_meta, "agentFileChangeReport")
            && meta_has_air_capability(
                Some(&self.client_capabilities_meta),
                "agentFileChangeReport",
            );
        tethys_schema::connection::ProviderExtensionCapabilities {
            goal_actions,
            steering,
            async_tasks,
            native_subagents,
            file_change_report,
            auth_status,
            provider_routing,
            gateway_auth: self.gateway_auth_enabled,
        }
    }

    pub(super) async fn resolve_permission(
        &self,
        session_id: &str,
        permission: PermissionRequested,
    ) -> PermissionDecision {
        let session_id = self.root_session_id(session_id);
        self.emit(
            &session_id,
            TurnEventBody::PermissionRequested(permission.clone()),
        );
        let decision = self
            .resolver
            .resolve(&SessionId::new(session_id.clone()), permission.clone())
            .await;
        self.emit(
            &session_id,
            TurnEventBody::PermissionResolved {
                req_id: permission.req_id,
                outcome: decision.outcome,
                decided_by: decision.decided_by,
                option_id: decision.option_id.clone(),
            },
        );
        decision
    }

    pub(super) async fn resolve_elicitation(
        &self,
        session_id: &str,
        mut request: tethys_schema::elicitation::ElicitationRequest,
    ) -> Option<tethys_schema::elicitation::ElicitationResponse> {
        let resolver = self.elicitation_resolver.as_ref()?;
        let session_id = self.root_session_id(session_id);
        request.req_id = self.next_elicitation_id();
        self.emit(
            &session_id,
            TurnEventBody::ElicitationRequested(request.clone()),
        );
        let response = resolver
            .resolve(&SessionId::new(session_id.clone()), request)
            .await;
        self.emit(
            &session_id,
            TurnEventBody::ElicitationResolved {
                req_id: response.req_id.clone(),
                outcome: response.outcome,
                values: response.values.clone(),
            },
        );
        Some(response)
    }

    pub(super) fn handle_extension_notification(&self, method: &str, params: String) {
        let method = canonical_extension_method(method);
        let value = serde_json::from_str::<serde_json::Value>(&params).ok();
        if let (Some(handler), Some(value)) = (&self.extension_notification_handler, &value) {
            handler(&method, value);
        }
        if method == "_auth/status_update" && self.auth_status_supported.load(Ordering::Acquire) {
            if let Some(status) = value.as_ref().and_then(provider_auth_status) {
                *self.provider_auth_status.lock() = Some(status);
            }
        }
        let Some(session_id) = value.and_then(|value| extension_session_id(&value)) else {
            return;
        };
        let session_id = self.root_session_id(&session_id);
        self.emit(
            &session_id,
            TurnEventBody::ProviderExtension(
                tethys_schema::provider_extension::ProviderExtension {
                    provider_id: self.provider_id.clone(),
                    method,
                    request_id: None,
                    params,
                },
            ),
        );
    }

    pub(super) fn prepare_extension_request(
        &self,
        method: &str,
        params: String,
    ) -> Result<ExtensionDispatch, ()> {
        let method = canonical_extension_method(method);
        if !self.extension_methods.contains(&method) {
            return Ok(ExtensionDispatch::Unclaimed);
        }
        let value = serde_json::from_str::<serde_json::Value>(&params).map_err(|_| ())?;
        if let Some(answer) = self
            .extension_request_handler
            .as_ref()
            .and_then(|handler| handler(&method, &value))
        {
            return Ok(ExtensionDispatch::Immediate(answer));
        }
        let session_id = self.root_session_id(&extension_session_id(&value).ok_or(())?);
        let (request_id, response) = self.queue_extension_request(&session_id, method, params);
        Ok(ExtensionDispatch::Pending {
            session_id,
            request_id,
            response,
        })
    }

    pub(super) fn await_extension_response(
        self: Arc<Self>,
        session_id: String,
        request_id: String,
        response: oneshot::Receiver<serde_json::Value>,
        responder: Responder<serde_json::Value>,
    ) -> impl std::future::Future<Output = Result<(), agent_client_protocol::Error>> + Send {
        let cancellation = responder.cancellation();
        async move {
            tokio::select! {
                _ = cancellation.cancelled() => {
                    self.cancel_extension_request(&session_id, &request_id);
                    responder.respond_with_error(agent_client_protocol::Error::request_cancelled())
                }
                response = response => match response {
                    Ok(value) => responder.respond(value),
                    Err(_) => responder.respond_with_error(agent_client_protocol::Error::request_cancelled()),
                }
            }
        }
    }

    pub(super) fn queue_extension_request(
        &self,
        session_id: &str,
        method: String,
        params: String,
    ) -> (String, oneshot::Receiver<serde_json::Value>) {
        let request_id = self.next_extension_id();
        let (response, receiver) = oneshot::channel();
        self.pending_extensions.lock().insert(
            request_id.clone(),
            PendingExtension {
                session_id: session_id.to_string(),
                response,
            },
        );
        self.emit(
            session_id,
            TurnEventBody::ProviderExtension(
                tethys_schema::provider_extension::ProviderExtension {
                    provider_id: self.provider_id.clone(),
                    method,
                    request_id: Some(request_id.clone()),
                    params,
                },
            ),
        );
        (request_id, receiver)
    }

    pub(super) fn extension_request_resolved(
        &self,
        session_id: &str,
        request_id: &str,
        cancelled: bool,
    ) {
        self.emit(
            session_id,
            TurnEventBody::ProviderExtensionResolved {
                request_id: request_id.to_string(),
                cancelled,
            },
        );
    }

    pub(super) fn respond_extension(
        &self,
        session_id: &SessionId,
        request_id: &str,
        response: serde_json::Value,
    ) -> Result<(), ConnectionError> {
        let mut pending = self.pending_extensions.lock();
        let Some(request) = pending.get(request_id) else {
            return Err(ConnectionError::SessionNotFound(request_id.to_string()));
        };
        if request.session_id != session_id.0 {
            return Err(ConnectionError::Protocol(
                "extension response belongs to another session".into(),
            ));
        }
        let request = pending
            .remove(request_id)
            .ok_or_else(|| ConnectionError::SessionNotFound(request_id.to_string()))?;
        request
            .response
            .send(response)
            .map_err(|_| ConnectionError::Transport("extension request was cancelled".into()))
    }

    pub(super) fn cancel_extension_requests(&self, session_id: &str) {
        let request_ids = {
            self.pending_extensions
                .lock()
                .iter()
                .filter(|(_, request)| request.session_id == session_id)
                .map(|(request_id, _)| request_id.clone())
                .collect::<Vec<_>>()
        };
        for request_id in request_ids {
            self.cancel_extension_request(session_id, &request_id);
        }
    }

    pub(super) fn cancel_extension_request(&self, session_id: &str, request_id: &str) {
        let removed = {
            let mut pending = self.pending_extensions.lock();
            if pending
                .get(request_id)
                .is_some_and(|request| request.session_id == session_id)
            {
                pending.remove(request_id).is_some()
            } else {
                false
            }
        };
        if removed {
            self.extension_request_resolved(session_id, request_id, true);
        }
    }

    pub(super) fn close_connection(&self) {
        let mut session_ids = self.sessions.lock().keys().cloned().collect::<HashSet<_>>();
        session_ids.extend(self.session_roots.lock().keys().cloned());
        session_ids.extend(
            self.pending_extensions
                .lock()
                .values()
                .map(|request| request.session_id.clone()),
        );
        for session_id in &session_ids {
            self.cancel_extension_requests(session_id);
            self.terminals.close_session(session_id);
        }
        self.session_roots.lock().clear();
        self.subagent_roots.lock().clear();
        self.sessions.lock().clear();
        self.synthetic.lock().clear();
        self.replaying.lock().clear();
    }

    pub(super) fn set_session_roots(
        &self,
        session_id: &str,
        cwd: PathBuf,
        additional: Vec<PathBuf>,
    ) {
        let roots = std::iter::once(cwd).chain(additional).collect();
        self.session_roots
            .lock()
            .insert(session_id.to_string(), roots);
    }

    pub(super) fn close_session(&self, session_id: &str) {
        self.cancel_extension_requests(session_id);
        self.terminals.close_session(session_id);
        self.session_roots.lock().remove(session_id);
        self.subagent_roots
            .lock()
            .retain(|child, root| child != session_id && root != session_id);
        self.sessions.lock().remove(session_id);
        self.synthetic.lock().remove(session_id);
        self.replaying.lock().remove(session_id);
    }

    pub(super) async fn checked_path(
        &self,
        session_id: &str,
        path: &Path,
        allow_new_file: bool,
    ) -> Result<PathBuf, String> {
        if !path.is_absolute() {
            return Err("ACP filesystem paths must be absolute".to_string());
        }
        let session_id = self.root_session_id(session_id);
        let roots = self
            .session_roots
            .lock()
            .get(&session_id)
            .cloned()
            .ok_or_else(|| "session has no trusted filesystem roots".to_string())?;
        let mut canonical_roots = Vec::with_capacity(roots.len());
        for root in roots {
            if let Ok(root) = tokio::fs::canonicalize(root).await {
                canonical_roots.push(root);
            }
        }
        let canonical_path = if allow_new_file {
            match tokio::fs::canonicalize(path).await {
                Ok(path) => path,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    let name = path
                        .file_name()
                        .filter(|name| !name.is_empty())
                        .ok_or_else(|| "invalid file path".to_string())?;
                    let parent = path
                        .parent()
                        .ok_or_else(|| "file path has no parent".to_string())?;
                    tokio::fs::canonicalize(parent)
                        .await
                        .map_err(|error| error.to_string())?
                        .join(name)
                }
                Err(error) => return Err(error.to_string()),
            }
        } else {
            tokio::fs::canonicalize(path)
                .await
                .map_err(|error| error.to_string())?
        };
        if canonical_roots
            .iter()
            .any(|root| canonical_path.starts_with(root))
        {
            Ok(canonical_path)
        } else {
            Err("path is outside the trusted session roots".to_string())
        }
    }

    pub(super) async fn read_text_file(
        &self,
        session_id: &str,
        path: &Path,
        line: Option<u32>,
        limit: Option<u32>,
    ) -> Result<String, String> {
        let path = self.checked_path(session_id, path, false).await?;
        let content = tokio::fs::read_to_string(path)
            .await
            .map_err(|error| error.to_string())?;
        let lines = content.lines();
        let lines = lines.skip(line.unwrap_or(1).saturating_sub(1) as usize);
        Ok(match limit {
            Some(limit) => lines.take(limit as usize).collect::<Vec<_>>().join("\n"),
            None => lines.collect::<Vec<_>>().join("\n"),
        })
    }

    pub(super) async fn write_text_file(
        &self,
        session_id: &str,
        path: &Path,
        content: &str,
    ) -> Result<(), String> {
        let path = self.checked_path(session_id, path, true).await?;
        if let Ok(metadata) = tokio::fs::metadata(&path).await {
            if metadata.is_dir() {
                return Err("cannot write text to a directory".to_string());
            }
        }
        tokio::fs::write(path, content)
            .await
            .map_err(|error| error.to_string())
    }

    pub(super) async fn session_directory(&self, session_id: &str) -> Result<PathBuf, String> {
        let session_id = self.root_session_id(session_id);
        let root = self
            .session_roots
            .lock()
            .get(&session_id)
            .and_then(|roots| roots.first())
            .cloned()
            .ok_or_else(|| "session has no trusted working directory".to_string())?;
        self.checked_path(&session_id, &root, false).await
    }

    /// Ensures a session's event channel exists before its first event.
    pub(super) fn register(&self, session_id: &str) {
        self.sessions
            .lock()
            .entry(session_id.to_string())
            .or_insert_with(|| SessionChannel {
                tx: broadcast::channel(1024).0,
                buffer: Vec::new(),
                taken: false,
            });
    }

    pub(super) fn set_replaying(&self, session_id: &str, replaying: bool) {
        self.replaying
            .lock()
            .insert(session_id.to_string(), replaying);
    }

    pub(super) fn subscribe(&self, session_id: &str) -> broadcast::Receiver<ConnectionEvent> {
        let mut sessions = self.sessions.lock();
        let channel = sessions
            .entry(session_id.to_string())
            .or_insert_with(|| SessionChannel {
                tx: broadcast::channel(1024).0,
                buffer: Vec::new(),
                taken: false,
            });
        let receiver = channel.tx.subscribe();
        if !channel.taken {
            for event in channel.buffer.drain(..) {
                let _ = channel.tx.send(event);
            }
            channel.taken = true;
        }
        receiver
    }

    pub(super) fn map_v1(
        &self,
        session_id: &str,
        raw_update: &serde_json::Value,
    ) -> (String, Vec<TurnEventBody>) {
        let mut synthetic = self.synthetic.lock();
        let ids = synthetic.entry(session_id.to_string()).or_default();
        let mut events = match serde_json::from_value::<acp1::SessionUpdate>(raw_update.clone()) {
            Ok(update) => map::v1_update(&update, ids),
            Err(_) => vec![TurnEventBody::Unknown {
                raw: raw_update.to_string(),
            }],
        };
        drop(synthetic);
        let root_session_id = self.process_session_update(session_id, raw_update, &mut events);
        (root_session_id, events)
    }

    pub(super) fn process_session_update(
        &self,
        session_id: &str,
        raw_update: &serde_json::Value,
        events: &mut Vec<TurnEventBody>,
    ) -> String {
        let root_session_id = self.root_session_id(session_id);
        let is_subagent_session = root_session_id != session_id;
        let prompt_request_id = self.active_prompt_metadata.lock().get(session_id).cloned();
        let child_session_id = self.session_update_handler.as_ref().and_then(|handler| {
            handler(session_id, prompt_request_id.as_deref(), raw_update, events)
        });
        if let Some(request_id) = prompt_request_id {
            let reported = events.iter().any(|event| match event {
                TurnEventBody::SessionInfo(info) => matches!(
                    &info.file_change_report,
                    Patch::Set(report) if report.request_id == request_id
                ),
                _ => false,
            });
            if reported {
                let mut active = self.active_prompt_metadata.lock();
                if active.get(session_id) == Some(&request_id) {
                    active.remove(session_id);
                }
            }
        }
        for event in events.iter_mut() {
            if let TurnEventBody::CommandsAvailable { commands } = event {
                for command in commands {
                    command.tethys_control = self.tethys_commands.get(&command.name).copied();
                }
            }
        }

        if is_subagent_session {
            nest_subagent_events(session_id, events);
        }
        if let Some(child_session_id) = child_session_id {
            if child_session_id != session_id {
                if is_subagent_session {
                    for event in events.iter_mut() {
                        if let TurnEventBody::ToolCallUpsert {
                            tool_call_id,
                            patch,
                        } = event
                        {
                            if tool_call_id == &child_session_id
                                && patch.parent_tool_call_id.is_none()
                            {
                                patch.parent_tool_call_id = Some(session_id.to_string());
                            }
                        }
                    }
                }
                self.subagent_roots
                    .lock()
                    .insert(child_session_id, root_session_id.clone());
            }
        }
        root_session_id
    }

    pub(super) fn root_session_id(&self, session_id: &str) -> String {
        self.subagent_roots
            .lock()
            .get(session_id)
            .cloned()
            .unwrap_or_else(|| session_id.to_string())
    }

    #[cfg(feature = "acp-v2")]
    pub(super) fn enrich_session_update(
        &self,
        session_id: &str,
        update: &impl Serialize,
        events: &mut Vec<TurnEventBody>,
    ) -> String {
        serde_json::to_value(update)
            .map(|raw| self.process_session_update(session_id, &raw, events))
            .unwrap_or_else(|_| self.root_session_id(session_id))
    }

    pub(super) fn map_permission_metadata(
        &self,
        raw: &serde_json::Value,
        permission: &mut PermissionRequested,
    ) {
        if let Some(handler) = &self.permission_metadata_handler {
            handler(raw, permission);
        }
    }

    pub(super) fn prompt_response_events(&self, response: &impl Serialize) -> Vec<TurnEventBody> {
        self.prompt_response_handler
            .as_ref()
            .and_then(|handler| serde_json::to_value(response).ok().map(|raw| handler(&raw)))
            .unwrap_or_default()
    }
}

pub(super) fn nest_subagent_events(session_id: &str, events: &mut Vec<TurnEventBody>) {
    let mut nested = Vec::with_capacity(events.len());
    for event in events.drain(..) {
        match event {
            TurnEventBody::MessageChunk(chunk)
                if matches!(chunk.role, Role::Agent | Role::Thought) =>
            {
                let text = match &chunk.block {
                    tethys_schema::thread::ContentBlock::Text(text)
                    | tethys_schema::thread::ContentBlock::TextWithMetadata { text, .. } => {
                        Some(text.clone())
                    }
                    _ => None,
                };
                if let Some(text) = text {
                    nested.push(TurnEventBody::ToolCallContentChunk {
                        tool_call_id: session_id.to_string(),
                        item: ToolCallContent::Text(text),
                    });
                } else {
                    nested.push(TurnEventBody::MessageChunk(chunk));
                }
            }
            TurnEventBody::ToolCallUpsert {
                tool_call_id,
                mut patch,
            } => {
                if tool_call_id != session_id && patch.parent_tool_call_id.is_none() {
                    patch.parent_tool_call_id = Some(session_id.to_string());
                }
                nested.push(TurnEventBody::ToolCallUpsert {
                    tool_call_id,
                    patch,
                });
            }
            other => nested.push(other),
        }
    }
    *events = nested;
}

pub(super) fn merge_session_update_meta(
    update: serde_json::Value,
    notification_meta: Option<serde_json::Map<String, serde_json::Value>>,
) -> serde_json::Value {
    let Some(mut notification_meta) = notification_meta else {
        return update;
    };
    let Some(mut update_object) = update.as_object().cloned() else {
        return update;
    };
    if let Some(serde_json::Value::Object(update_meta)) = update_object.get("_meta") {
        notification_meta.extend(update_meta.clone());
    }
    update_object.insert("_meta".into(), serde_json::Value::Object(notification_meta));
    serde_json::Value::Object(update_object)
}
