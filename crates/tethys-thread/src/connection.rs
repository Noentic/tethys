//! Transport-independent agent connection contract (architecture §6.1).

use async_trait::async_trait;
use futures::stream::Stream;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use tethys_schema::connection::{AgentInfo, NormalizedCapabilities};
use tethys_schema::thread::{
    ConfigOption, ContentBlock, PermOutcome, PermissionRequested, TurnEventBody,
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
    #[error("transport: {0}")]
    Transport(String),
    #[error("protocol: {0}")]
    Protocol(String),
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
    async fn resolve(&self, session: &SessionId, request: PermissionRequested) -> PermissionDecision;
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
    async fn resume_session(
        &self,
        request: ResumeSession,
    ) -> Result<SessionHandle, ConnectionError>;

    async fn list_sessions(&self, _cwd: &Path) -> Result<Vec<SessionSummary>, ConnectionError> {
        Err(ConnectionError::Unsupported("list_sessions"))
    }

    async fn close_session(&self, id: &SessionId) -> Result<(), ConnectionError>;

    /// Resolves on acceptance (v2) or turn end (v1 adapter).
    async fn prompt(
        &self,
        id: &SessionId,
        blocks: Vec<ContentBlock>,
    ) -> Result<(), ConnectionError>;

    async fn cancel(&self, id: &SessionId) -> Result<(), ConnectionError>;

    async fn set_config_option(
        &self,
        _id: &SessionId,
        _config_id: &str,
        _value: serde_json::Value,
    ) -> Result<Vec<ConfigOption>, ConnectionError> {
        Err(ConnectionError::Unsupported("set_config_option"))
    }

    async fn login(&self, _method_id: &str) -> Result<(), ConnectionError> {
        Err(ConnectionError::Unsupported("login"))
    }

    fn events(&self, id: &SessionId) -> EventStream;

    fn session_deleter(&self) -> Option<&dyn SessionDeleter> {
        None
    }
}
