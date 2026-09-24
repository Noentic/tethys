//! Transport-independent agent connection contract (architecture §6.1).

use async_trait::async_trait;
use futures::stream::Stream;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use tethys_schema::connection::{AgentInfo, NormalizedCapabilities};
use tethys_schema::thread::{
    ConfigOption, ContentBlock, PermOutcome, PermissionRequested, ProviderControl,
    ProviderControlResult, TurnEventBody,
};

/// Session identifier assigned by the agent.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SessionId(pub String);

impl SessionId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for SessionId {
    fn from(value: &str) -> Self {
        Self(value.to_string())
    }
}

impl From<String> for SessionId {
    fn from(value: String) -> Self {
        Self(value)
    }
}

impl std::fmt::Display for SessionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone)]
pub struct NewSession {
    pub cwd: PathBuf,
    pub additional_directories: Vec<PathBuf>,
    /// MCP server declarations, opaque until the sync engine owns them (M1.4).
    pub mcp_servers: Vec<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct ResumeSession {
    pub session_id: SessionId,
    pub cwd: PathBuf,
    pub additional_directories: Vec<PathBuf>,
    pub mcp_servers: Vec<serde_json::Value>,
    /// Ask the agent to replay its transcript (v2 `replayFrom: start`, v1 load).
    pub replay: bool,
}

#[derive(Debug, Clone)]
pub struct SessionHandle {
    pub id: SessionId,
    pub config_options: Vec<ConfigOption>,
}

#[derive(Debug, Clone)]
pub struct SessionSummary {
    pub id: SessionId,
    pub cwd: PathBuf,
    pub title: Option<String>,
    pub updated_at: Option<String>,
}

/// One normalized event with its provenance: live events drive state, replayed
/// transcript events only materialize missing entries (D12).
#[derive(Debug, Clone, PartialEq)]
pub struct ConnectionEvent {
    pub body: TurnEventBody,
    pub replayed: bool,
}

/// Stream of normalized events for one session.
pub type EventStream = Pin<Box<dyn Stream<Item = Result<ConnectionEvent, ConnectionError>> + Send>>;

#[derive(Debug, thiserror::Error)]
pub enum ConnectionError {
    #[error("authentication required")]
    AuthRequired,
    #[error("transport: {0}")]
    Transport(String),
    #[error("protocol: {0}")]
    Protocol(String),
    #[error("provider error {code}: {message}")]
    Remote {
        code: i32,
        message: String,
        data: Option<serde_json::Value>,
    },
    #[error("unsupported: {0}")]
    Unsupported(&'static str),
    #[error("session not found: {0}")]
    SessionNotFound(String),
    #[error("cancelled")]
    Cancelled,
}

/// Decision returned by a permission resolver (M1.8 replaces the injected
/// resolver with the policy engine).
#[derive(Debug, Clone)]
pub struct PermissionDecision {
    pub outcome: PermOutcome,
    /// Agent option selected for `PermOutcome::Approved`.
    pub option_id: Option<String>,
    pub decided_by: tethys_schema::thread::Decider,
}

impl PermissionDecision {
    pub fn cancelled() -> Self {
        Self {
            outcome: PermOutcome::Cancelled,
            option_id: None,
            decided_by: tethys_schema::thread::Decider::Policy,
        }
    }
}

#[async_trait]
pub trait PermissionResolver: Send + Sync {
    /// Resolves one request. The session is supplied so a policy resolver can
    /// read that thread's workspace, isolation and mode without reaching back
    /// into the reader task (M1.7 U3).
    async fn resolve(
        &self,
        session: &SessionId,
        request: PermissionRequested,
    ) -> PermissionDecision;
}

/// Optional capability: agents that can delete sessions (architecture §6.1).
#[async_trait]
pub trait SessionDeleter: Send + Sync {
    async fn delete_session(&self, id: &SessionId) -> Result<(), ConnectionError>;
}

/// One connected agent process; implementors are version adapters.
#[async_trait]
pub trait AgentConnection: Send + Sync {
    fn info(&self) -> &AgentInfo;
    fn capabilities(&self) -> &NormalizedCapabilities;

    /// Auth methods the agent declared at `initialize` (empty means none).
    fn auth_methods(&self) -> &[tethys_schema::agents::AuthMethodView] {
        &[]
    }

    async fn new_session(&self, request: NewSession) -> Result<SessionHandle, ConnectionError>;
    async fn load_session(
        &self,
        _request: ResumeSession,
    ) -> Result<SessionHandle, ConnectionError> {
        Err(ConnectionError::Unsupported("load_session"))
    }
    async fn resume_session(
        &self,
        request: ResumeSession,
    ) -> Result<SessionHandle, ConnectionError>;

    async fn fork_session(
        &self,
        _source: &SessionId,
        _request: NewSession,
    ) -> Result<SessionHandle, ConnectionError> {
        Err(ConnectionError::Unsupported("session_fork"))
    }

    async fn list_sessions(&self, cwd: &Path) -> Result<Vec<SessionSummary>, ConnectionError> {
        let mut summaries = Vec::new();
        let mut cursor = None;
        let mut seen = std::collections::HashSet::new();
        loop {
            let (page, next_cursor) = self.list_sessions_page(cwd, cursor.as_deref()).await?;
            summaries.extend(page);
            let Some(next_cursor) = next_cursor else {
                return Ok(summaries);
            };
            if !seen.insert(next_cursor.clone()) {
                return Err(ConnectionError::Protocol(
                    "session/list returned a repeated cursor".into(),
                ));
            }
            cursor = Some(next_cursor);
        }
    }

    /// One `session/list` page: `next_cursor` is the exclusive continuation.
    async fn list_sessions_page(
        &self,
        _cwd: &Path,
        _cursor: Option<&str>,
    ) -> Result<(Vec<SessionSummary>, Option<String>), ConnectionError> {
        Err(ConnectionError::Unsupported("list_sessions_page"))
    }

    async fn close_session(&self, id: &SessionId) -> Result<(), ConnectionError>;

    /// Resolves on acceptance (v2) or turn end (v1 adapter).
    async fn prompt(
        &self,
        id: &SessionId,
        blocks: Vec<ContentBlock>,
    ) -> Result<(), ConnectionError>;

    async fn cancel(&self, id: &SessionId) -> Result<(), ConnectionError>;

    /// Completes the exact ACP extension request surfaced to the user.
    async fn respond_extension(
        &self,
        _session_id: &SessionId,
        _request_id: &str,
        _response: serde_json::Value,
    ) -> Result<(), ConnectionError> {
        Err(ConnectionError::Unsupported("provider_extension"))
    }

    async fn set_config_option(
        &self,
        _id: &SessionId,
        _config_id: &str,
        _value: serde_json::Value,
    ) -> Result<Vec<ConfigOption>, ConnectionError> {
        Err(ConnectionError::Unsupported("set_config_option"))
    }

    /// ACP v1 `session/set_mode`. Config options carry no mode; dispatch by the
    /// normalized option's `mode` category (M1.17 AD6).
    async fn set_mode(&self, _id: &SessionId, _mode_id: &str) -> Result<(), ConnectionError> {
        Err(ConnectionError::Unsupported("session/set_mode"))
    }

    async fn provider_control(
        &self,
        _id: &SessionId,
        _control: ProviderControl,
    ) -> Result<ProviderControlResult, ConnectionError> {
        Err(ConnectionError::Unsupported("provider_control"))
    }

    async fn login(
        &self,
        _method_id: &str,
        _meta: Option<serde_json::Map<String, serde_json::Value>>,
    ) -> Result<(), ConnectionError> {
        Err(ConnectionError::Unsupported("login"))
    }

    async fn logout(&self) -> Result<(), ConnectionError> {
        Err(ConnectionError::Unsupported("logout"))
    }

    fn events(&self, id: &SessionId) -> EventStream;

    fn session_deleter(&self) -> Option<&dyn SessionDeleter> {
        None
    }
}
