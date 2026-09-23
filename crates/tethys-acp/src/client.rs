//! Typed ACP client connection over a supplied transport.
//!
//! `tethys-acp` never spawns: the agent-servers store owns the process and
//! hands the pipes to [`connect`]. Both protocol versions normalize into the
//! `tethys-schema` event model; v2 is compiled behind the `acp-v2` feature.

use parking_lot::Mutex;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use agent_client_protocol::schema::v1 as acp1;
#[cfg(feature = "acp-v2")]
use agent_client_protocol::schema::v2 as acp2;
use agent_client_protocol::schema::ProtocolVersion;
#[cfg(feature = "acp-v2")]
use agent_client_protocol::V2ConnectionTo;
use agent_client_protocol::{
    on_receive_notification, on_receive_request, Agent, Client, ConnectTo, ConnectionTo, Handled,
    JsonRpcNotification, Responder,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tethys_schema::agents::{AuthMethodShape, AuthMethodView, LoginTerminalOutput};
use tethys_schema::connection::{AcpProtocol, AgentInfo, NormalizedCapabilities};
use tethys_schema::sync::{McpTransports, RegistryValue, SessionServer, TransportKind};
use tethys_schema::thread::{
    AgentCommandControl, ConfigOption, ContentBlock, PermOutcome, PermissionRequested, Role,
    ToolCallContent, TurnEventBody,
};
use tethys_thread::{
    AgentConnection, ConnectionError, ConnectionEvent, ElicitationResolver, EventStream,
    NewSession, PermissionDecision, PermissionResolver, ResumeSession, SessionDeleter,
    SessionHandle, SessionId, SessionSummary,
};
use tokio::sync::{broadcast, oneshot};
use tokio_util::sync::CancellationToken;

use crate::map::{self, SyntheticMessageIds};
use crate::terminal_host::TerminalHost;

/// Provider-owned handler for one claimed extension request. Returning
/// `Some(value)` answers the agent immediately with that JSON-RPC result;
/// returning `None` surfaces the request to the UI responder.
pub type ExtensionRequestHandler =
    Arc<dyn Fn(&str, &serde_json::Value) -> Option<serde_json::Value> + Send + Sync>;

/// Provider-owned handler for one claimed extension notification.
pub type ExtensionNotificationHandler = Arc<dyn Fn(&str, &serde_json::Value) + Send + Sync>;

/// Enriches updates with Provider metadata and returns a spawned child session
/// id so the shared client can route later child updates to the root thread.
pub type SessionUpdateHandler =
    Arc<dyn Fn(&serde_json::Value, &mut Vec<TurnEventBody>) -> Option<String> + Send + Sync>;

/// Enriches normalized configuration options returned by session setup.
pub type ConfigOptionsHandler = Arc<dyn Fn(&mut [ConfigOption]) + Send + Sync>;

/// Adds negotiated request metadata to the standard permission presentation.
pub type PermissionMetadataHandler =
    Arc<dyn Fn(&serde_json::Value, &mut PermissionRequested) + Send + Sync>;

/// Maps metadata attached to a prompt response into additional normalized
/// events without changing the protocol's stop reason.
pub type PromptResponseHandler =
    Arc<dyn Fn(&serde_json::Value) -> Vec<TurnEventBody> + Send + Sync>;

/// One injected bundle of ACP client services. The advertised capability
/// payload is derived from what is actually wired, never ahead of a handler
/// (M1.17 AD4). Filesystem and terminal handlers are always compiled in; the
/// elicitation and terminal-auth capabilities are opt in.
#[derive(Clone)]
pub struct AcpClientServices {
    pub permission: Arc<dyn PermissionResolver>,
    pub elicitation: Option<Arc<dyn ElicitationResolver>>,
    /// Whether a PTY-backed terminal-auth host is wired for this process.
    pub terminal_auth: bool,
}

impl AcpClientServices {
    pub fn new(permission: Arc<dyn PermissionResolver>) -> Self {
        Self {
            permission,
            elicitation: None,
            terminal_auth: false,
        }
    }

    /// Wires the form/URL elicitation handler and advertises it.
    pub fn with_elicitation(mut self, resolver: Arc<dyn ElicitationResolver>) -> Self {
        self.elicitation = Some(resolver);
        self
    }

    /// Wires terminal authentication and advertises `auth.terminal`.
    pub fn with_terminal_auth(mut self) -> Self {
        self.terminal_auth = true;
        self
    }
}

/// Provider-owned data applied to one ACP connection.
#[derive(Clone)]
pub struct AcpProviderIntegration {
    pub id: String,
    pub initialize_meta: serde_json::Map<String, serde_json::Value>,
    pub client_capabilities_meta: serde_json::Map<String, serde_json::Value>,
    pub extension_methods: Vec<String>,
    pub tethys_commands: HashMap<String, AgentCommandControl>,
    pub extension_request_handler: Option<ExtensionRequestHandler>,
    pub extension_notification_handler: Option<ExtensionNotificationHandler>,
    pub session_update_handler: Option<SessionUpdateHandler>,
    pub config_options_handler: Option<ConfigOptionsHandler>,
    pub permission_metadata_handler: Option<PermissionMetadataHandler>,
    pub prompt_response_handler: Option<PromptResponseHandler>,
}

/// Connection setup (architecture §7.1: the caller picks the version).
pub struct AcpConnectOptions {
    pub protocol: AcpProtocol,
    pub client_name: String,
    pub integration: Option<AcpProviderIntegration>,
    pub services: AcpClientServices,
}

impl AcpConnectOptions {
    pub fn new(protocol: AcpProtocol, permission_resolver: Arc<dyn PermissionResolver>) -> Self {
        Self {
            protocol,
            client_name: "tethys".to_string(),
            integration: None,
            services: AcpClientServices::new(permission_resolver),
        }
    }
}

#[derive(Clone)]
enum Wire {
    V1(ConnectionTo<Agent>),
    #[cfg(feature = "acp-v2")]
    V2(V2ConnectionTo<Agent>),
}

struct SessionChannel {
    tx: broadcast::Sender<ConnectionEvent>,
    buffer: Vec<ConnectionEvent>,
    taken: bool,
}

/// Shared state behind the SDK handler closures.
struct Shared {
    sessions: Mutex<HashMap<String, SessionChannel>>,
    synthetic: Mutex<HashMap<String, SyntheticMessageIds>>,
    replaying: Mutex<HashMap<String, bool>>,
    resolver: Arc<dyn PermissionResolver>,
    elicitation_resolver: Option<Arc<dyn ElicitationResolver>>,
    permission_seq: AtomicU32,
    elicitation_seq: AtomicU32,
    session_roots: Mutex<HashMap<String, Vec<PathBuf>>>,
    subagent_roots: Mutex<HashMap<String, String>>,
    terminals: TerminalHost,
    provider_id: String,
    tethys_commands: HashMap<String, AgentCommandControl>,
    extension_methods: HashSet<String>,
    extension_request_handler: Option<ExtensionRequestHandler>,
    extension_notification_handler: Option<ExtensionNotificationHandler>,
    session_update_handler: Option<SessionUpdateHandler>,
    config_options_handler: Option<ConfigOptionsHandler>,
    permission_metadata_handler: Option<PermissionMetadataHandler>,
    prompt_response_handler: Option<PromptResponseHandler>,
    extension_seq: AtomicU32,
    pending_extensions: Mutex<HashMap<String, PendingExtension>>,
}

struct PendingExtension {
    session_id: String,
    response: oneshot::Sender<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonRpcNotification)]
#[notification(method = "session/update")]
#[serde(rename_all = "camelCase")]
struct RawSessionNotification {
    session_id: String,
    update: serde_json::Value,
    #[serde(default, rename = "_meta")]
    meta: Option<serde_json::Map<String, serde_json::Value>>,
}

enum ExtensionDispatch {
    Unclaimed,
    Immediate(serde_json::Value),
    Pending {
        session_id: String,
        request_id: String,
        response: oneshot::Receiver<serde_json::Value>,
    },
}

impl Shared {
    fn new(options: &AcpConnectOptions) -> Self {
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
            extension_seq: AtomicU32::new(0),
            pending_extensions: Mutex::new(HashMap::new()),
        }
    }

    fn emit(&self, session_id: &str, body: TurnEventBody) {
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

    fn enrich_config_options(&self, options: &mut [ConfigOption]) {
        if let Some(handler) = &self.config_options_handler {
            handler(options);
        }
    }

    fn next_request_id(&self) -> String {
        format!(
            "perm-{}",
            self.permission_seq.fetch_add(1, Ordering::Relaxed) + 1
        )
    }

    fn next_elicitation_id(&self) -> String {
        format!(
            "elicit-{}",
            self.elicitation_seq.fetch_add(1, Ordering::Relaxed) + 1
        )
    }

    fn next_extension_id(&self) -> String {
        format!(
            "extension-{}",
            self.extension_seq.fetch_add(1, Ordering::Relaxed) + 1
        )
    }

    async fn resolve_permission(
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

    async fn resolve_elicitation(
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

    fn handle_extension_notification(&self, method: &str, params: String) {
        let method = canonical_extension_method(method);
        let value = serde_json::from_str::<serde_json::Value>(&params).ok();
        if let (Some(handler), Some(value)) = (&self.extension_notification_handler, &value) {
            handler(&method, value);
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

    fn prepare_extension_request(
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

    fn await_extension_response(
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

    fn queue_extension_request(
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

    fn extension_request_resolved(&self, session_id: &str, request_id: &str, cancelled: bool) {
        self.emit(
            session_id,
            TurnEventBody::ProviderExtensionResolved {
                request_id: request_id.to_string(),
                cancelled,
            },
        );
    }

    fn respond_extension(
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

    fn cancel_extension_requests(&self, session_id: &str) {
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

    fn cancel_extension_request(&self, session_id: &str, request_id: &str) {
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

    fn close_connection(&self) {
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

    fn set_session_roots(&self, session_id: &str, cwd: PathBuf, additional: Vec<PathBuf>) {
        let roots = std::iter::once(cwd).chain(additional).collect();
        self.session_roots
            .lock()
            .insert(session_id.to_string(), roots);
    }

    fn close_session(&self, session_id: &str) {
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

    async fn checked_path(
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

    async fn read_text_file(
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

    async fn write_text_file(
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

    async fn session_directory(&self, session_id: &str) -> Result<PathBuf, String> {
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
    fn register(&self, session_id: &str) {
        self.sessions
            .lock()
            .entry(session_id.to_string())
            .or_insert_with(|| SessionChannel {
                tx: broadcast::channel(1024).0,
                buffer: Vec::new(),
                taken: false,
            });
    }

    fn set_replaying(&self, session_id: &str, replaying: bool) {
        self.replaying
            .lock()
            .insert(session_id.to_string(), replaying);
    }

    fn subscribe(&self, session_id: &str) -> broadcast::Receiver<ConnectionEvent> {
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

    fn map_v1(
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

    fn process_session_update(
        &self,
        session_id: &str,
        raw_update: &serde_json::Value,
        events: &mut Vec<TurnEventBody>,
    ) -> String {
        let root_session_id = self.root_session_id(session_id);
        let is_subagent_session = root_session_id != session_id;
        let child_session_id = self
            .session_update_handler
            .as_ref()
            .and_then(|handler| handler(raw_update, events));
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

    fn root_session_id(&self, session_id: &str) -> String {
        self.subagent_roots
            .lock()
            .get(session_id)
            .cloned()
            .unwrap_or_else(|| session_id.to_string())
    }

    #[cfg(feature = "acp-v2")]
    fn enrich_session_update(
        &self,
        session_id: &str,
        update: &impl Serialize,
        events: &mut Vec<TurnEventBody>,
    ) -> String {
        serde_json::to_value(update)
            .map(|raw| self.process_session_update(session_id, &raw, events))
            .unwrap_or_else(|_| self.root_session_id(session_id))
    }

    fn map_permission_metadata(
        &self,
        raw: &serde_json::Value,
        permission: &mut PermissionRequested,
    ) {
        if let Some(handler) = &self.permission_metadata_handler {
            handler(raw, permission);
        }
    }

    fn prompt_response_events(&self, response: &impl Serialize) -> Vec<TurnEventBody> {
        self.prompt_response_handler
            .as_ref()
            .and_then(|handler| serde_json::to_value(response).ok().map(|raw| handler(&raw)))
            .unwrap_or_default()
    }
}

/// A live agent connection (one process, ACP v1 or v2).
pub struct AcpConnection {
    info: AgentInfo,
    capabilities: NormalizedCapabilities,
    auth_methods: Vec<AuthMethodView>,
    terminal_auth: HashMap<String, TerminalAuthSpec>,
    auth_method_meta: HashMap<String, serde_json::Map<String, serde_json::Value>>,
    agent_meta: Option<serde_json::Map<String, serde_json::Value>>,
    integration_id: Option<String>,
    protocol: AcpProtocol,
    wire: Wire,
    shared: Arc<Shared>,
    shutdown: CancellationToken,
    closed: CancellationToken,
}

/// In-memory terminal auth invocation data. Environment values are never
/// returned over the UI/API boundary or written to profile storage.
#[derive(Debug, Clone)]
struct TerminalAuthSpec {
    args: Vec<String>,
    env: HashMap<String, String>,
}

impl AcpConnection {
    /// Resolves when the transport ends (process exit or agent disconnect).
    pub async fn wait_closed(&self) {
        self.closed.cancelled().await;
    }

    /// Auth methods the agent declared at `initialize` (empty means none).
    pub fn auth_methods(&self) -> &[AuthMethodView] {
        &self.auth_methods
    }

    pub fn integration_id(&self) -> Option<&str> {
        self.integration_id.as_deref()
    }

    fn terminal_auth_spec(&self, method_id: &str) -> Option<&TerminalAuthSpec> {
        self.terminal_auth.get(method_id)
    }

    /// Starts the ACP-declared terminal login command in an owned PTY.
    pub async fn start_terminal_auth(
        &self,
        profile_id: &str,
        method_id: &str,
        command: String,
        cwd: PathBuf,
        base_env: Vec<(String, String)>,
    ) -> Result<String, ConnectionError> {
        let method = self
            .terminal_auth_spec(method_id)
            .ok_or(ConnectionError::Unsupported("terminal_auth_method"))?;
        let mut env: Vec<acp1::EnvVariable> = base_env
            .into_iter()
            .map(|(name, value)| acp1::EnvVariable::new(name, value))
            .collect();
        env.extend(
            method
                .env
                .iter()
                .map(|(name, value)| acp1::EnvVariable::new(name.clone(), value.clone())),
        );
        self.shared
            .terminals
            .create(
                terminal_auth_owner(profile_id),
                command,
                method.args.clone(),
                env,
                cwd,
                None,
                Arc::new(|_, _| {}),
            )
            .await
            .map_err(ConnectionError::Transport)
    }

    pub fn terminal_auth_output(
        &self,
        profile_id: &str,
        terminal_id: &str,
    ) -> Result<LoginTerminalOutput, ConnectionError> {
        let snapshot = self
            .shared
            .terminals
            .auth_output(&terminal_auth_owner(profile_id), terminal_id)
            .map_err(ConnectionError::Transport)?;
        Ok(LoginTerminalOutput {
            output: snapshot.output,
            truncated: snapshot.truncated,
            exited: snapshot.exited,
            exit_code: snapshot.exit_code,
        })
    }

    pub fn terminal_auth_write(
        &self,
        profile_id: &str,
        terminal_id: &str,
        text: &str,
    ) -> Result<(), ConnectionError> {
        self.shared
            .terminals
            .write_auth(&terminal_auth_owner(profile_id), terminal_id, text)
            .map_err(ConnectionError::Transport)
    }

    pub fn terminal_auth_cancel(
        &self,
        profile_id: &str,
        terminal_id: &str,
    ) -> Result<(), ConnectionError> {
        self.shared
            .terminals
            .cancel_auth(&terminal_auth_owner(profile_id), terminal_id)
            .map_err(ConnectionError::Transport)
    }

    pub fn auth_method_meta(
        &self,
        method_id: &str,
    ) -> Option<&serde_json::Map<String, serde_json::Value>> {
        self.auth_method_meta.get(method_id)
    }

    pub fn agent_meta(&self) -> Option<&serde_json::Map<String, serde_json::Value>> {
        self.agent_meta.as_ref()
    }
}

fn terminal_auth_owner(profile_id: &str) -> String {
    format!("auth:{profile_id}")
}

fn auth_method_view(
    id: &str,
    name: &str,
    description: Option<&str>,
    shape: AuthMethodShape,
) -> AuthMethodView {
    AuthMethodView {
        id: id.to_string(),
        name: name.to_string(),
        description: description.map(str::to_string),
        shape,
    }
}

#[cfg(test)]
mod auth_shape_tests {
    use super::*;

    #[test]
    fn view_carries_id_name_description_and_shape() {
        let view = auth_method_view(
            "tui-auth",
            "Terminal Auth",
            Some("run in a terminal"),
            AuthMethodShape::CliPassthrough,
        );
        assert_eq!(view.id, "tui-auth");
        assert_eq!(view.name, "Terminal Auth");
        assert_eq!(view.description.as_deref(), Some("run in a terminal"));
        assert_eq!(view.shape, AuthMethodShape::CliPassthrough);
    }

    #[test]
    fn unknown_shape_names_the_method_id() {
        let view = auth_method_view(
            "future-auth",
            "Future",
            None,
            AuthMethodShape::Unknown {
                id: "future-auth".into(),
            },
        );
        assert_eq!(
            view.shape,
            AuthMethodShape::Unknown {
                id: "future-auth".into()
            }
        );
    }
}

impl Drop for AcpConnection {
    fn drop(&mut self) {
        self.shutdown.cancel();
    }
}

/// Connects to an agent over an already-established transport and runs the
/// ACP `initialize` handshake.
pub async fn connect<T>(
    options: AcpConnectOptions,
    transport: T,
) -> Result<AcpConnection, ConnectionError>
where
    T: ConnectTo<Client> + Send + 'static,
{
    let mut methods = HashSet::new();
    for method in options
        .integration
        .iter()
        .flat_map(|integration| &integration.extension_methods)
    {
        if !method.starts_with('_') {
            return Err(ConnectionError::Protocol(format!(
                "ACP extension method must start with _: {method}"
            )));
        }
        if !methods.insert(method) {
            return Err(ConnectionError::Protocol(format!(
                "duplicate ACP extension method claim: {method}"
            )));
        }
    }
    match options.protocol {
        AcpProtocol::V1 => connect_v1(options, transport).await,
        AcpProtocol::V2 => {
            #[cfg(feature = "acp-v2")]
            {
                connect_v2(options, transport).await
            }
            #[cfg(not(feature = "acp-v2"))]
            {
                let _ = transport;
                Err(ConnectionError::Unsupported("acp_v2"))
            }
        }
    }
}

/// Maps the v1 `auth_methods` declaration to the UI-visible shape list.
fn auth_methods_v1(methods: &[acp1::AuthMethod]) -> Vec<AuthMethodView> {
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
            )
        })
        .collect()
}

fn terminal_auth_v1(methods: &[acp1::AuthMethod]) -> HashMap<String, TerminalAuthSpec> {
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

fn nest_subagent_events(session_id: &str, events: &mut Vec<TurnEventBody>) {
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

fn merge_session_update_meta(
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

fn auth_method_meta_v1(
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

/// Maps the v2 `auth_methods` declaration; unknown variants degrade to
/// [`AuthMethodShape::Unknown`] rather than dropping the row.
#[cfg(feature = "acp-v2")]
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
            )
        })
        .collect()
}

async fn connect_v1<T>(
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
    Ok(AcpConnection {
        info,
        capabilities: capabilities_v1(&response.agent_capabilities, elicitation_enabled),
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

#[cfg(feature = "acp-v2")]
async fn connect_v2<T>(
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
                client_capabilities_meta,
            ))
            .meta(initialize_meta),
        )
        .block_task()
        .await
        .map_err(map_sdk_error)?;

    Ok(AcpConnection {
        info: agent_info(
            &response.info.name,
            response.info.version.as_str(),
            response.info.title.as_deref(),
        ),
        capabilities: capabilities_v2(&response.capabilities, elicitation_enabled),
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

impl AcpConnection {
    pub fn protocol(&self) -> AcpProtocol {
        self.protocol
    }
}

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
                let blocks = blocks
                    .into_iter()
                    .map(|block| to_v1_block(block, &self.capabilities))
                    .collect::<Result<Vec<_>, _>>()?;
                self.shared.emit(
                    &id.0,
                    map::state_changed(tethys_schema::thread::SessionState::Running),
                );
                let response = connection
                    .send_request(acp1::PromptRequest::new(id.0.clone(), blocks))
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
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
                let blocks = blocks
                    .into_iter()
                    .map(|block| to_v2_block(block, &self.capabilities))
                    .collect::<Result<Vec<_>, _>>()?;
                let response = connection
                    .send_request(acp2::PromptRequest::new(id.0.clone(), blocks))
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                for event in self.shared.prompt_response_events(&response) {
                    self.shared.emit(&id.0, event);
                }
                Ok(())
            }
        }
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

    async fn login(&self, method_id: &str) -> Result<(), ConnectionError> {
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
                    .send_request(acp1::AuthenticateRequest::new(acp1::AuthMethodId::new(
                        method_id,
                    )))
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                Ok(())
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(_) => Err(ConnectionError::Unsupported("login_v2")),
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

fn to_v1_block(
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
fn to_v2_block(
    block: ContentBlock,
    capabilities: &NormalizedCapabilities,
) -> Result<acp2::ContentBlock, ConnectionError> {
    let v1_block = to_v1_block(block, capabilities)?;
    let value = serde_json::to_value(v1_block)
        .map_err(|error| ConnectionError::Protocol(error.to_string()))?;
    serde_json::from_value(value).map_err(|error| ConnectionError::Protocol(error.to_string()))
}

fn content_metadata_field<T: serde::de::DeserializeOwned>(
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

fn raw_content_metadata_field<T: serde::de::DeserializeOwned>(
    metadata: &str,
    field: &str,
) -> Option<T> {
    serde_json::from_str::<serde_json::Value>(metadata)
        .ok()?
        .get(field)
        .cloned()
        .and_then(|value| serde_json::from_value(value).ok())
}

fn v1_permission_response(decision: PermissionDecision) -> acp1::RequestPermissionResponse {
    let outcome = match decision.outcome {
        PermOutcome::Approved => match decision.option_id {
            Some(option_id) => acp1::RequestPermissionOutcome::Selected(
                acp1::SelectedPermissionOutcome::new(option_id),
            ),
            None => acp1::RequestPermissionOutcome::Cancelled,
        },
        _ => acp1::RequestPermissionOutcome::Cancelled,
    };
    acp1::RequestPermissionResponse::new(outcome)
}

#[cfg(feature = "acp-v2")]
fn v2_permission_response(decision: PermissionDecision) -> acp2::RequestPermissionResponse {
    let outcome = match decision.outcome {
        PermOutcome::Approved => match decision.option_id {
            Some(option_id) => acp2::RequestPermissionOutcome::Selected(
                acp2::SelectedPermissionOutcome::new(option_id),
            ),
            None => acp2::RequestPermissionOutcome::Cancelled,
        },
        _ => acp2::RequestPermissionOutcome::Cancelled,
    };
    acp2::RequestPermissionResponse::new(outcome)
}

fn capabilities_v1(
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
    }
}

fn v1_client_capabilities(
    elicitation: bool,
    terminal_auth: bool,
    meta: Option<serde_json::Map<String, serde_json::Value>>,
) -> acp1::ClientCapabilities {
    let mut capabilities = acp1::ClientCapabilities::new()
        .fs(acp1::FileSystemCapabilities::new()
            .read_text_file(true)
            .write_text_file(true))
        .terminal(true);
    if terminal_auth {
        capabilities.auth = acp1::AuthCapabilities::new().terminal(true);
    }
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
fn capabilities_v2(
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
    }
}

#[cfg(feature = "acp-v2")]
fn v2_client_capabilities(
    elicitation: bool,
    meta: Option<serde_json::Map<String, serde_json::Value>>,
) -> acp2::ClientCapabilities {
    let mut capabilities = acp2::ClientCapabilities::new();
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
fn elicitation_session_v1(request: &acp1::CreateElicitationRequest) -> Option<String> {
    match request.scope() {
        acp1::ElicitationScope::Session(scope) => Some(scope.session_id.to_string()),
        _ => None,
    }
}

fn canonical_extension_method(method: &str) -> String {
    if method.starts_with('_') {
        method.to_string()
    } else {
        format!("_{method}")
    }
}

fn extension_session_id(params: &serde_json::Value) -> Option<String> {
    params
        .get("sessionId")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
}

#[cfg(feature = "acp-v2")]
fn elicitation_session_v2(request: &acp2::CreateElicitationRequest) -> Option<String> {
    match request.scope() {
        acp2::ElicitationScope::Session(scope) => Some(scope.session_id.to_string()),
        _ => None,
    }
}

fn elicitation_content(
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
            };
            (key, value)
        })
        .collect()
}

fn v1_elicitation_response(
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
fn v2_elicitation_response(
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
fn v2_elicitation_content(
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
            };
            (key, value)
        })
        .collect()
}

fn parse_session_servers(values: &[serde_json::Value]) -> Vec<SessionServer> {
    values
        .iter()
        .filter_map(|value| serde_json::from_value(value.clone()).ok())
        .collect()
}

fn resolved_value(value: &RegistryValue) -> Option<String> {
    match value {
        RegistryValue::Plain(text) => Some(text.clone()),
        RegistryValue::Secret { .. } => None,
    }
}

/// v1 mode state first, then config options, in the normalized option shape.
fn v1_session_config(
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

fn v1_mcp_servers(
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
fn v2_mcp_servers(
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

fn agent_info(name: &str, version: &str, title: Option<&str>) -> AgentInfo {
    AgentInfo {
        name: name.to_string(),
        version: version.to_string(),
        title: title.map(str::to_string),
    }
}

fn map_sdk_error(error: agent_client_protocol::Error) -> ConnectionError {
    if error.code == acp1::ErrorCode::AuthRequired {
        ConnectionError::AuthRequired
    } else {
        ConnectionError::Protocol(error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn session_servers() -> Vec<serde_json::Value> {
        vec![
            json!({
                "name": "github",
                "transport": "stdio",
                "command": "github-mcp-server",
                "args": ["stdio"],
                "env": { "GITHUB_TOKEN": "resolved-secret" }
            }),
            json!({
                "name": "linear",
                "transport": "http",
                "url": "https://mcp.linear.app/mcp",
                "headers": { "Authorization": "Bearer resolved-secret" }
            }),
            json!({
                "name": "legacy",
                "transport": "sse",
                "url": "https://legacy.example.com/sse"
            }),
        ]
    }

    #[test]
    fn v1_maps_stdio_http_and_sse_by_capability() {
        let all = McpTransports {
            stdio: true,
            http: true,
            sse: true,
        };
        let mapped = serde_json::to_value(v1_mcp_servers(&session_servers(), &all)).expect("json");
        assert_eq!(mapped[0]["command"], "github-mcp-server");
        assert_eq!(mapped[0]["env"][0]["name"], "GITHUB_TOKEN");
        assert_eq!(mapped[1]["type"], "http");
        assert_eq!(mapped[1]["headers"][0]["value"], "Bearer resolved-secret");
        assert_eq!(mapped[2]["type"], "sse");

        let stdio_only = McpTransports {
            stdio: true,
            http: false,
            sse: false,
        };
        let mapped = v1_mcp_servers(&session_servers(), &stdio_only);
        assert_eq!(mapped.len(), 1);
    }

    #[test]
    fn raw_session_notification_preserves_unknown_update_variants() {
        let raw = json!({
            "sessionId": "parent",
            "update": {
                "sessionUpdate": "subagent_spawned",
                "subagentSessionId": "child",
                "name": "Explore",
                "task": "Inspect the module",
                "_meta": {"claudeCode": {"parentToolUseId": "tool-1"}},
                "capabilities": {}
            },
            "_meta": {"goal": {"objective": "Inspect"}}
        });
        let notification: RawSessionNotification =
            serde_json::from_value(raw).expect("raw notification");
        assert_eq!(notification.session_id, "parent");
        assert_eq!(notification.update["sessionUpdate"], "subagent_spawned");
        assert!(
            serde_json::from_value::<acp1::SessionUpdate>(notification.update.clone()).is_err()
        );
        let merged = merge_session_update_meta(notification.update, notification.meta);
        assert_eq!(merged["_meta"]["goal"]["objective"], "Inspect");
        assert_eq!(merged["_meta"]["claudeCode"]["parentToolUseId"], "tool-1");
    }

    #[test]
    fn marks_provider_commands_handled_by_tethys() {
        struct TestPermissionResolver;

        #[async_trait]
        impl PermissionResolver for TestPermissionResolver {
            async fn resolve(
                &self,
                _session: &SessionId,
                _request: PermissionRequested,
            ) -> PermissionDecision {
                PermissionDecision {
                    outcome: PermOutcome::Approved,
                    option_id: None,
                    decided_by: tethys_schema::thread::Decider::Policy,
                }
            }
        }

        let mut options = AcpConnectOptions::new(AcpProtocol::V1, Arc::new(TestPermissionResolver));
        options.integration = Some(AcpProviderIntegration {
            id: "fixture".into(),
            initialize_meta: Default::default(),
            client_capabilities_meta: Default::default(),
            extension_methods: vec![],
            tethys_commands: HashMap::from([("model".into(), AgentCommandControl::Model)]),
            extension_request_handler: None,
            extension_notification_handler: None,
            session_update_handler: None,
            config_options_handler: None,
            permission_metadata_handler: None,
            prompt_response_handler: None,
        });
        let shared = Shared::new(&options);
        let mut events = vec![TurnEventBody::CommandsAvailable {
            commands: vec![tethys_schema::thread::AgentCommand {
                name: "model".into(),
                description: Some("Provider model command".into()),
                input: None,
                tethys_control: None,
            }],
        }];

        shared.process_session_update("thread", &json!({}), &mut events);

        assert!(matches!(
            &events[0],
            TurnEventBody::CommandsAvailable { commands }
                if commands[0].tethys_control == Some(AgentCommandControl::Model)
        ));
    }

    #[test]
    fn routes_subagent_updates_into_the_root_transcript() {
        use tethys_schema::thread::{MessageChunk, ToolCallPatch, ToolCallStatus, ToolOrigin};

        struct TestPermissionResolver;

        #[async_trait]
        impl PermissionResolver for TestPermissionResolver {
            async fn resolve(
                &self,
                _session: &SessionId,
                _request: PermissionRequested,
            ) -> PermissionDecision {
                PermissionDecision {
                    outcome: PermOutcome::Approved,
                    option_id: None,
                    decided_by: tethys_schema::thread::Decider::Policy,
                }
            }
        }

        let mut options = AcpConnectOptions::new(AcpProtocol::V1, Arc::new(TestPermissionResolver));
        options.integration = Some(AcpProviderIntegration {
            id: "fixture".into(),
            initialize_meta: Default::default(),
            client_capabilities_meta: Default::default(),
            extension_methods: vec![],
            tethys_commands: Default::default(),
            extension_request_handler: None,
            extension_notification_handler: None,
            session_update_handler: Some(Arc::new(|raw, events| {
                if raw["sessionUpdate"] == "subagent_spawned" {
                    events.push(TurnEventBody::ToolCallUpsert {
                        tool_call_id: "child".into(),
                        patch: ToolCallPatch {
                            origin: Some(ToolOrigin::Subagent),
                            status: Some(ToolCallStatus::Executing),
                            ..Default::default()
                        },
                    });
                    Some("child".into())
                } else {
                    None
                }
            })),
            config_options_handler: None,
            permission_metadata_handler: None,
            prompt_response_handler: None,
        });
        let shared = Shared::new(&options);

        let mut spawned = Vec::new();
        let root = shared.process_session_update(
            "root",
            &json!({"sessionUpdate": "subagent_spawned"}),
            &mut spawned,
        );
        assert_eq!(root, "root");
        assert_eq!(shared.root_session_id("child"), "root");

        let mut child_events = vec![
            TurnEventBody::MessageChunk(MessageChunk {
                message_id: "m1".into(),
                role: Role::Agent,
                block: ContentBlock::Text("Found the module.".into()),
            }),
            TurnEventBody::ToolCallUpsert {
                tool_call_id: "child-tool".into(),
                patch: ToolCallPatch::default(),
            },
        ];
        let root = shared.process_session_update("child", &json!({}), &mut child_events);
        assert_eq!(root, "root");
        assert!(matches!(
            &child_events[0],
            TurnEventBody::ToolCallContentChunk { tool_call_id, item }
                if tool_call_id == "child" && item == &ToolCallContent::Text("Found the module.".into())
        ));
        assert!(matches!(
            &child_events[1],
            TurnEventBody::ToolCallUpsert { tool_call_id, patch }
                if tool_call_id == "child-tool"
                    && patch.parent_tool_call_id.as_deref() == Some("child")
        ));
    }

    #[test]
    fn prompt_blocks_follow_negotiated_content_capabilities() {
        let mut capabilities = NormalizedCapabilities::default();
        capabilities.prompt_image = true;
        capabilities.prompt_audio = true;
        capabilities.prompt_embedded_context = true;

        let resource_link = to_v1_block(
            ContentBlock::ResourceLink {
                uri: "file:///tmp/a.txt".into(),
                name: "a.txt".into(),
                mime_type: Some("text/plain".into()),
                acp_metadata: None,
            },
            &capabilities,
        )
        .expect("resource link");
        assert!(matches!(resource_link, acp1::ContentBlock::ResourceLink(_)));

        for block in [
            ContentBlock::Image {
                mime_type: "image/png".into(),
                data: "aW1hZ2U=".into(),
                acp_metadata: None,
            },
            ContentBlock::Audio {
                mime_type: "audio/wav".into(),
                data: "YXVkaW8=".into(),
                acp_metadata: None,
            },
            ContentBlock::Resource {
                uri: "urn:text".into(),
                mime_type: Some("text/plain".into()),
                text: Some("embedded".into()),
                blob: None,
                acp_metadata: None,
            },
        ] {
            to_v1_block(block, &capabilities).expect("negotiated block");
        }

        capabilities.prompt_image = false;
        let error = to_v1_block(
            ContentBlock::Image {
                mime_type: "image/png".into(),
                data: "aW1hZ2U=".into(),
                acp_metadata: None,
            },
            &capabilities,
        )
        .expect_err("image must be gated");
        assert!(matches!(
            error,
            ConnectionError::Unsupported("prompt_image")
        ));
    }

    #[cfg(feature = "acp-v2")]
    #[test]
    fn v2_maps_stdio_and_http_only() {
        let all = McpTransports {
            stdio: true,
            http: true,
            sse: true,
        };
        let mapped = serde_json::to_value(v2_mcp_servers(&session_servers(), &all)).expect("json");
        assert_eq!(mapped.as_array().expect("array").len(), 2);
        assert_eq!(mapped[0]["type"], "stdio");
        assert_eq!(mapped[0]["command"], "github-mcp-server");
        assert_eq!(mapped[1]["type"], "http");

        let http_only = McpTransports {
            stdio: false,
            http: true,
            sse: false,
        };
        let mapped = v2_mcp_servers(&session_servers(), &http_only);
        assert_eq!(mapped.len(), 1);
    }

    #[test]
    fn unresolved_secret_refs_are_never_sent() {
        let values = vec![json!({
            "name": "github",
            "transport": "stdio",
            "command": "github-mcp-server",
            "env": { "GITHUB_TOKEN": { "secretRef": "keychain:tethys/github" } }
        })];
        let mapped =
            serde_json::to_value(v1_mcp_servers(&values, &McpTransports::all())).expect("json");
        assert!(mapped[0]["env"].as_array().expect("env array").is_empty());
    }
}
