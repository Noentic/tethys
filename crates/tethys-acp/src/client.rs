//! Typed ACP client connection over a supplied transport.
//!
//! `tethys-acp` never spawns: the agent-servers store owns the process and
//! hands the pipes to [`connect`]. Both protocol versions normalize into the
//! `tethys-schema` event model; v2 is compiled behind the `acp-v2` feature.

mod handshake;
#[cfg(feature = "acp-v2")]
mod handshake_v2;
mod inbound;
mod provider_control;
mod session;
mod wire;

#[cfg(test)]
mod tests;

use handshake::connect_v1;
#[cfg(feature = "acp-v2")]
use handshake_v2::connect_v2;

use parking_lot::Mutex;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

use agent_client_protocol::schema::v1 as acp1;
#[cfg(feature = "acp-v2")]
use agent_client_protocol::schema::v2 as acp2;
use agent_client_protocol::schema::ProtocolVersion;
#[cfg(feature = "acp-v2")]
use agent_client_protocol::V2ConnectionTo;
use agent_client_protocol::{
    on_receive_notification, on_receive_request, Agent, Client, ConnectTo, ConnectionTo, Handled,
    JsonRpcNotification, JsonRpcRequest, Responder,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tethys_schema::agents::{
    AuthMethodShape, AuthMethodView, LoginTerminalOutput, ProviderAuthStatus,
};
use tethys_schema::connection::{AcpProtocol, AgentInfo, NormalizedCapabilities};
use tethys_schema::sync::{McpTransports, RegistryValue, SessionServer, TransportKind};
use tethys_schema::thread::{
    AgentCommandControl, ConfigOption, ContentBlock, GoalAction, Patch, PermOutcome,
    PermissionRequested, ProviderControl, ProviderControlResult, ProviderRoute,
    ProviderRouteConfig, Role, SteeringOutcome, ToolCallContent, TurnEventBody,
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
pub type SessionUpdateHandler = Arc<
    dyn Fn(&str, Option<&str>, &serde_json::Value, &mut Vec<TurnEventBody>) -> Option<String>
        + Send
        + Sync,
>;

/// Builds request metadata only after the agent advertises its extension.
pub type PromptMetadataHandler = Arc<
    dyn Fn(
            &str,
            &str,
            Option<&serde_json::Map<String, serde_json::Value>>,
        ) -> Option<serde_json::Map<String, serde_json::Value>>
        + Send
        + Sync,
>;

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
#[derive(Clone, Default)]
pub struct AcpProviderIntegration {
    pub id: String,
    pub initialize_meta: serde_json::Map<String, serde_json::Value>,
    pub client_capabilities_meta: serde_json::Map<String, serde_json::Value>,
    pub gateway_auth: bool,
    pub extension_methods: Vec<String>,
    pub tethys_commands: HashMap<String, AgentCommandControl>,
    pub extension_request_handler: Option<ExtensionRequestHandler>,
    pub extension_notification_handler: Option<ExtensionNotificationHandler>,
    pub session_update_handler: Option<SessionUpdateHandler>,
    pub config_options_handler: Option<ConfigOptionsHandler>,
    pub permission_metadata_handler: Option<PermissionMetadataHandler>,
    pub prompt_response_handler: Option<PromptResponseHandler>,
    pub prompt_metadata_handler: Option<PromptMetadataHandler>,
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
    client_capabilities_meta: serde_json::Map<String, serde_json::Value>,
    gateway_auth_enabled: bool,
    tethys_commands: HashMap<String, AgentCommandControl>,
    extension_methods: HashSet<String>,
    extension_request_handler: Option<ExtensionRequestHandler>,
    extension_notification_handler: Option<ExtensionNotificationHandler>,
    session_update_handler: Option<SessionUpdateHandler>,
    config_options_handler: Option<ConfigOptionsHandler>,
    permission_metadata_handler: Option<PermissionMetadataHandler>,
    prompt_response_handler: Option<PromptResponseHandler>,
    prompt_metadata_handler: Option<PromptMetadataHandler>,
    extension_seq: AtomicU32,
    prompt_metadata_seq: AtomicU32,
    active_prompt_metadata: Mutex<HashMap<String, String>>,
    auth_status_supported: AtomicBool,
    provider_auth_status: Mutex<Option<ProviderAuthStatus>>,
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

#[derive(Debug, Clone, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_session/goal", response = serde_json::Value)]
#[serde(rename_all = "camelCase")]
struct GoalControlRequest {
    session_id: String,
    action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    objective: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_session/steering", response = serde_json::Value)]
#[serde(rename_all = "camelCase")]
struct SteeringRequest {
    session_id: String,
    prompt: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonRpcRequest)]
#[request(method = "_session/async_task/stop", response = serde_json::Value)]
#[serde(rename_all = "camelCase")]
struct AsyncTaskStopRequest {
    session_id: String,
    async_task_id: String,
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

    pub fn provider_auth_status(&self) -> Option<ProviderAuthStatus> {
        self.shared.provider_auth_status()
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
    metadata: Option<String>,
) -> AuthMethodView {
    AuthMethodView {
        id: id.to_string(),
        name: name.to_string(),
        description: description.map(str::to_string),
        shape,
        metadata,
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
