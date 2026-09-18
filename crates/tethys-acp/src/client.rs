//! Typed ACP client connection over a supplied transport.
//!
//! `tethys-acp` never spawns: the agent-servers store owns the process and
//! hands the pipes to [`connect`]. Both protocol versions normalize into the
//! `tethys-schema` event model; v2 is compiled behind the `acp-v2` feature.

use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use agent_client_protocol::schema::v1 as acp1;
#[cfg(feature = "acp-v2")]
use agent_client_protocol::schema::v2 as acp2;
use agent_client_protocol::schema::ProtocolVersion;
#[cfg(feature = "acp-v2")]
use agent_client_protocol::V2ConnectionTo;
use agent_client_protocol::{
    on_receive_notification, on_receive_request, Agent, Client, ConnectTo, ConnectionTo, Responder,
};
use async_trait::async_trait;
use tethys_schema::connection::{AcpProtocol, AgentInfo, NormalizedCapabilities};
use tethys_schema::thread::{ContentBlock, PermOutcome, PermissionRequested, TurnEventBody};
use tethys_thread::{
    AgentConnection, ConnectionError, ConnectionEvent, EventStream, NewSession, PermissionDecision,
    PermissionResolver, ResumeSession, SessionHandle, SessionId,
};
use tokio::sync::{broadcast, oneshot};
use tokio_util::sync::CancellationToken;

use crate::map::{self, SyntheticMessageIds};

/// Connection setup (architecture §7.1: the caller picks the version).
pub struct AcpConnectOptions {
    pub protocol: AcpProtocol,
    pub client_name: String,
    pub permission_resolver: Arc<dyn PermissionResolver>,
}

impl AcpConnectOptions {
    pub fn new(protocol: AcpProtocol, permission_resolver: Arc<dyn PermissionResolver>) -> Self {
        Self {
            protocol,
            client_name: "tethys".to_string(),
            permission_resolver,
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
    permission_seq: AtomicU32,
}

impl Shared {
    fn new(resolver: Arc<dyn PermissionResolver>) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            synthetic: Mutex::new(HashMap::new()),
            replaying: Mutex::new(HashMap::new()),
            resolver,
            permission_seq: AtomicU32::new(0),
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

    fn next_request_id(&self) -> String {
        format!(
            "perm-{}",
            self.permission_seq.fetch_add(1, Ordering::Relaxed) + 1
        )
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

    fn map_v1(&self, session_id: &str, update: &acp1::SessionUpdate) -> Vec<TurnEventBody> {
        let mut synthetic = self.synthetic.lock();
        let ids = synthetic.entry(session_id.to_string()).or_default();
        map::v1_update(update, ids)
    }
}

/// A live agent connection (one process, ACP v1 or v2).
pub struct AcpConnection {
    info: AgentInfo,
    capabilities: NormalizedCapabilities,
    protocol: AcpProtocol,
    wire: Wire,
    shared: Arc<Shared>,
    shutdown: CancellationToken,
    closed: CancellationToken,
}

impl AcpConnection {
    /// Resolves when the transport ends (process exit or agent disconnect).
    pub async fn wait_closed(&self) {
        self.closed.cancelled().await;
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

async fn connect_v1<T>(
    options: AcpConnectOptions,
    transport: T,
) -> Result<AcpConnection, ConnectionError>
where
    T: ConnectTo<Client> + Send + 'static,
{
    let shared = Arc::new(Shared::new(options.permission_resolver));
    let (handle_tx, handle_rx) = oneshot::channel();
    let shutdown = CancellationToken::new();
    let token = shutdown.clone();
    let closed = CancellationToken::new();
    let closed_task = closed.clone();

    let notify_shared = shared.clone();
    let request_shared = shared.clone();
    let client_name = options.client_name.clone();
    tokio::spawn(async move {
        let result = Client
            .builder()
            .name("tethys")
            .on_receive_notification(
                move |notification: acp1::SessionNotification, _connection: ConnectionTo<Agent>| {
                    let shared = notify_shared.clone();
                    async move {
                        let session_id = notification.session_id.to_string();
                        for event in shared.map_v1(&session_id, &notification.update) {
                            shared.emit(&session_id, event);
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
                        let permission = PermissionRequested {
                            req_id,
                            title,
                            description: None,
                            subject: Some(tethys_schema::thread::PermissionSubject::ToolCall {
                                tool_call_id: request.tool_call.tool_call_id.to_string(),
                            }),
                            options: request
                                .options
                                .iter()
                                .map(|option| tethys_schema::thread::PermOption {
                                    option_id: option.option_id.to_string(),
                                    name: option.name.clone(),
                                    kind: Some(map::label(&option.kind)),
                                })
                                .collect(),
                        };
                        shared.emit(
                            &session_id,
                            TurnEventBody::PermissionRequested(permission.clone()),
                        );
                        let resolver = shared.resolver.clone();
                        let resolve_shared = shared.clone();
                        connection.spawn(async move {
                            let decision = resolver.resolve(permission.clone()).await;
                            resolve_shared.emit(
                                &session_id,
                                TurnEventBody::PermissionResolved {
                                    req_id: permission.req_id.clone(),
                                    outcome: decision.outcome,
                                    decided_by: decision.decided_by,
                                },
                            );
                            responder.respond(v1_permission_response(decision))
                        })?;
                        Ok(())
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
        closed_task.cancel();
    });

    let wire = handle_rx.await.map_err(|_| {
        ConnectionError::Transport("connection ended before initialize".to_string())
    })?;
    let response = wire
        .send_request(
            acp1::InitializeRequest::new(ProtocolVersion::V1).client_info(
                acp1::Implementation::new(client_name, env!("CARGO_PKG_VERSION")),
            ),
        )
        .block_task()
        .await
        .map_err(map_sdk_error)?;

    let info = response
        .agent_info
        .as_ref()
        .map(|info| agent_info(&info.name, info.version.as_str(), info.title.as_deref()))
        .unwrap_or_else(|| agent_info("unknown", "", None));

    Ok(AcpConnection {
        info,
        capabilities: capabilities_v1(&response.agent_capabilities),
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
    let shared = Arc::new(Shared::new(options.permission_resolver));
    let (handle_tx, handle_rx) = oneshot::channel();
    let shutdown = CancellationToken::new();
    let token = shutdown.clone();
    let closed = CancellationToken::new();
    let closed_task = closed.clone();

    let notify_shared = shared.clone();
    let request_shared = shared.clone();
    let client_name = options.client_name.clone();
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
                        for event in crate::map_v2::v2_update(&notification.update) {
                            shared.emit(&session_id, event);
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
                        shared.emit(
                            &session_id,
                            TurnEventBody::PermissionRequested(permission.clone()),
                        );
                        let resolver = shared.resolver.clone();
                        let resolve_shared = shared.clone();
                        connection.spawn(async move {
                            let decision = resolver.resolve(permission.clone()).await;
                            resolve_shared.emit(
                                &session_id,
                                TurnEventBody::PermissionResolved {
                                    req_id: permission.req_id.clone(),
                                    outcome: decision.outcome,
                                    decided_by: decision.decided_by,
                                },
                            );
                            responder.respond(v2_permission_response(decision))
                        })?;
                        Ok(())
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
        closed_task.cancel();
    });

    let wire = handle_rx.await.map_err(|_| {
        ConnectionError::Transport("connection ended before initialize".to_string())
    })?;
    let response = wire
        .send_request(acp2::InitializeRequest::new(
            ProtocolVersion::V2,
            acp2::Implementation::new(client_name, env!("CARGO_PKG_VERSION")),
        ))
        .block_task()
        .await
        .map_err(map_sdk_error)?;

    Ok(AcpConnection {
        info: agent_info(
            &response.info.name,
            response.info.version.as_str(),
            response.info.title.as_deref(),
        ),
        capabilities: capabilities_v2(&response.capabilities),
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

    async fn new_session(&self, request: NewSession) -> Result<SessionHandle, ConnectionError> {
        match &self.wire {
            Wire::V1(connection) => {
                let response = connection
                    .send_request(
                        acp1::NewSessionRequest::new(request.cwd)
                            .additional_directories(request.additional_directories),
                    )
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                let id = SessionId::new(response.session_id.to_string());
                self.shared.register(&id.0);
                Ok(SessionHandle {
                    id,
                    config_options: response
                        .config_options
                        .as_ref()
                        .map(|options| options.iter().map(map::config_option).collect())
                        .unwrap_or_default(),
                })
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => {
                let response = connection
                    .send_request(
                        acp2::NewSessionRequest::new(request.cwd)
                            .additional_directories(request.additional_directories),
                    )
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                let id = SessionId::new(response.session_id.to_string());
                self.shared.register(&id.0);
                Ok(SessionHandle {
                    id,
                    config_options: response
                        .config_options
                        .iter()
                        .map(crate::map_v2::config_option)
                        .collect(),
                })
            }
        }
    }

    async fn resume_session(
        &self,
        request: ResumeSession,
    ) -> Result<SessionHandle, ConnectionError> {
        let session_id = request.session_id.0.clone();
        self.shared.set_replaying(&session_id, true);
        let result = match &self.wire {
            Wire::V1(connection) => {
                let response = connection
                    .send_request(acp1::LoadSessionRequest::new(
                        session_id.clone(),
                        request.cwd,
                    ))
                    .block_task()
                    .await
                    .map_err(map_sdk_error);
                response.map(|response| SessionHandle {
                    id: request.session_id.clone(),
                    config_options: response
                        .config_options
                        .as_ref()
                        .map(|options| options.iter().map(map::config_option).collect())
                        .unwrap_or_default(),
                })
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => {
                let mut resume = acp2::ResumeSessionRequest::new(session_id.clone(), request.cwd)
                    .additional_directories(request.additional_directories);
                if request.replay {
                    resume = resume
                        .replay_from(acp2::ReplayFrom::Start(acp2::ReplayFromStart::default()));
                }
                let response = connection
                    .send_request(resume)
                    .block_task()
                    .await
                    .map_err(map_sdk_error);
                response.map(|response| SessionHandle {
                    id: request.session_id.clone(),
                    config_options: response
                        .config_options
                        .iter()
                        .map(crate::map_v2::config_option)
                        .collect(),
                })
            }
        };
        self.shared.set_replaying(&session_id, false);
        result
    }

    async fn close_session(&self, id: &SessionId) -> Result<(), ConnectionError> {
        match &self.wire {
            Wire::V1(_) => {
                let _ = id;
                Err(ConnectionError::Unsupported("close_session_v1"))
            }
            #[cfg(feature = "acp-v2")]
            Wire::V2(connection) => {
                connection
                    .send_request(acp2::CloseSessionRequest::new(id.0.clone()))
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
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
                    .map(to_v1_block)
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
                    .map(to_v2_block)
                    .collect::<Result<Vec<_>, _>>()?;
                connection
                    .send_request(acp2::PromptRequest::new(id.0.clone(), blocks))
                    .block_task()
                    .await
                    .map_err(map_sdk_error)?;
                Ok(())
            }
        }
    }

    async fn cancel(&self, id: &SessionId) -> Result<(), ConnectionError> {
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
}

fn to_v1_block(block: ContentBlock) -> Result<acp1::ContentBlock, ConnectionError> {
    match block {
        ContentBlock::Text(text) => Ok(acp1::ContentBlock::Text(acp1::TextContent::new(text))),
        other => Err(ConnectionError::Unsupported(match other {
            ContentBlock::ResourceLink { .. } => "prompt_resource_link",
            ContentBlock::Image { .. } => "prompt_image",
            _ => "prompt_content_block",
        })),
    }
}

#[cfg(feature = "acp-v2")]
fn to_v2_block(block: ContentBlock) -> Result<acp2::ContentBlock, ConnectionError> {
    match block {
        ContentBlock::Text(text) => Ok(acp2::ContentBlock::Text(acp2::TextContent::new(text))),
        other => Err(ConnectionError::Unsupported(match other {
            ContentBlock::ResourceLink { .. } => "prompt_resource_link",
            ContentBlock::Image { .. } => "prompt_image",
            _ => "prompt_content_block",
        })),
    }
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

fn capabilities_v1(capabilities: &acp1::AgentCapabilities) -> NormalizedCapabilities {
    NormalizedCapabilities {
        load_session: capabilities.load_session,
        resume: capabilities.load_session,
        mcp_stdio: true,
        prompt_embedded_context: capabilities.prompt_capabilities.embedded_context,
    }
}

#[cfg(feature = "acp-v2")]
fn capabilities_v2(capabilities: &acp2::AgentCapabilities) -> NormalizedCapabilities {
    let session = capabilities.session.as_ref();
    NormalizedCapabilities {
        load_session: false,
        resume: session.is_some(),
        mcp_stdio: session.and_then(|session| session.mcp.as_ref()).is_some(),
        prompt_embedded_context: session
            .and_then(|session| session.prompt.as_ref())
            .is_some(),
    }
}

fn agent_info(name: &str, version: &str, title: Option<&str>) -> AgentInfo {
    AgentInfo {
        name: name.to_string(),
        version: version.to_string(),
        title: title.map(str::to_string),
    }
}

fn map_sdk_error(error: agent_client_protocol::Error) -> ConnectionError {
    ConnectionError::Protocol(error.to_string())
}
