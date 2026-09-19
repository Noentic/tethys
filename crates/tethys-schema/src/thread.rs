//! Thread, turn, and normalized agent-event model (architecture §7.3, §12).
//!
//! This is the wire contract above `tethys-acp`: every ACP version translates
//! into these types, and the UI consumes them through `events.subscribe`.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Stable thread identifier.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Type)]
#[serde(transparent)]
pub struct ThreadId(pub String);

impl ThreadId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for ThreadId {
    fn from(value: &str) -> Self {
        Self(value.to_string())
    }
}

impl From<String> for ThreadId {
    fn from(value: String) -> Self {
        Self(value)
    }
}

impl std::fmt::Display for ThreadId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::ops::Deref for ThreadId {
    type Target = str;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// UI-02 thread states.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum ThreadState {
    Idle,
    Running,
    AwaitingApproval,
    Error,
    Interrupted,
    Suspended,
    Archived,
}

/// Three-state field for v2 patch semantics.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type, Default)]
#[serde(tag = "type", content = "value")]
pub enum Patch<T> {
    #[default]
    Unchanged,
    Clear,
    Set(T),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct StateChanged {
    pub state: SessionState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum SessionState {
    Running,
    Idle { stop_reason: Option<StopReason> },
    RequiresAction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum StopReason {
    EndTurn,
    MaxTokens,
    StopSequence,
    Refusal,
    Cancelled,
    Error,
    Other(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum Role {
    User,
    Agent,
    Thought,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub enum ContentBlock {
    Text(String),
    ResourceLink {
        uri: String,
        name: String,
        mime_type: Option<String>,
    },
    Image {
        mime_type: String,
        data: String,
    },
    Unknown(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct MessageUpsert {
    pub message_id: String,
    pub role: Role,
    pub content: Patch<Vec<ContentBlock>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct MessageChunk {
    pub message_id: String,
    pub role: Role,
    pub block: ContentBlock,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum ToolCallStatus {
    Pending,
    Executing,
    Completed,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ToolCallPatch {
    pub title: Option<String>,
    pub kind: Option<String>,
    pub status: Option<ToolCallStatus>,
    pub input: Option<String>,
    pub output: Option<String>,
    pub locations: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub enum ToolCallContent {
    Text(String),
    Diff { path: String, patch: String },
    Terminal { terminal_id: String },
    Unknown(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum PlanEntryPriority {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum PlanEntryStatus {
    Pending,
    InProgress,
    Completed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct PlanEntry {
    pub content: String,
    pub priority: PlanEntryPriority,
    pub status: PlanEntryStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct PlanContent {
    pub entries: Vec<PlanEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ConfigOption {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub current_value: String,
    pub values: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct AgentCommand {
    pub name: String,
    pub description: Option<String>,
    pub input: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
pub struct UsageSnapshot {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub total_tokens: u32,
    pub cost: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct SessionInfo {
    pub title: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub enum PermissionSubject {
    Command { command: String },
    ToolCall { tool_call_id: String },
    File { path: String },
    Unknown(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct PermOption {
    pub option_id: String,
    pub name: String,
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum PermOutcome {
    Approved,
    Rejected,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum Decider {
    User,
    Policy,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct PermissionRequested {
    pub req_id: String,
    pub title: String,
    pub description: Option<String>,
    pub subject: Option<PermissionSubject>,
    pub options: Vec<PermOption>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub enum WriteVia {
    AcpFs,
    Watcher,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum CheckpointKind {
    TurnStart,
    TurnEnd,
    Manual,
}

/// Normalized event model (architecture §7.3). One v2-shaped stream for all agents.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "type", content = "body")]
pub enum TurnEventBody {
    StateChanged(StateChanged),
    MessageUpsert(MessageUpsert),
    MessageChunk(MessageChunk),
    ToolCallUpsert {
        tool_call_id: String,
        patch: ToolCallPatch,
    },
    ToolCallContentChunk {
        tool_call_id: String,
        item: ToolCallContent,
    },
    TerminalUpsert {
        terminal_id: String,
        patch: Patch<String>,
    },
    TerminalOutputChunk {
        terminal_id: String,
        bytes: String,
    },
    PlanUpsert {
        plan_id: String,
        plan: PlanContent,
    },
    ConfigOptionsChanged {
        options: Vec<ConfigOption>,
    },
    CommandsAvailable {
        commands: Vec<AgentCommand>,
    },
    SessionInfo(SessionInfo),
    Usage {
        snapshot: UsageSnapshot,
    },
    PermissionRequested(PermissionRequested),
    PermissionResolved {
        req_id: String,
        outcome: PermOutcome,
        decided_by: Decider,
    },
    FileWrite {
        path: String,
        before: Option<String>,
        after: String,
        via: WriteVia,
    },
    Checkpoint {
        oid: String,
        kind: CheckpointKind,
    },
    Error {
        code: String,
        message: String,
        retryable: bool,
    },
    Unknown {
        raw: String,
    },
}

/// Sequenced event delivered to subscribers (`events.subscribe`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct EventEnvelope {
    pub thread_id: ThreadId,
    pub seq: u32,
    pub event: TurnEventBody,
}

/// Materialized thread entry (architecture §12 `entries` table): the latest
/// state per message, tool call, plan, terminal, permission, or error.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", content = "entry")]
pub enum Entry {
    Message {
        message_id: String,
        role: Role,
        blocks: Vec<ContentBlock>,
    },
    ToolCall {
        tool_call_id: String,
        patch: ToolCallPatch,
    },
    Plan {
        plan_id: String,
        plan: PlanContent,
    },
    Terminal {
        terminal_id: String,
        output: String,
    },
    Permission {
        req_id: String,
        request: PermissionRequested,
        outcome: Option<PermOutcome>,
    },
    Error {
        code: String,
        message: String,
    },
}

impl Entry {
    /// Stable entry identity, used to dedupe replayed events.
    pub fn entry_id(&self) -> &str {
        match self {
            Entry::Message { message_id, .. } => message_id,
            Entry::ToolCall { tool_call_id, .. } => tool_call_id,
            Entry::Plan { plan_id, .. } => plan_id,
            Entry::Terminal { terminal_id, .. } => terminal_id,
            Entry::Permission { req_id, .. } => req_id,
            Entry::Error { .. } => "error",
        }
    }
}

/// Request for `thread.create`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct CreateThread {
    pub workspace_id: String,
    pub agent_profile_id: String,
    pub workdir: String,
}

/// Thread row returned by `thread.create/list/get`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ThreadSummary {
    pub id: ThreadId,
    pub workspace_id: String,
    pub agent_profile_id: String,
    pub title: String,
    pub workdir: String,
    pub state: ThreadState,
    pub session_id: Option<String>,
}

/// Thread plus its materialized entries (`thread.get`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ThreadView {
    pub thread: ThreadSummary,
    pub entries: Vec<Entry>,
    pub latest_seq: u32,
}
