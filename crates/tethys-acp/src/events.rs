use serde::{Deserialize, Serialize};

/// Three-state field for v2 patch semantics (architecture §7.3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(tag = "type", content = "value")]
pub enum Patch<T> {
    #[default]
    Unchanged,
    Clear,
    Set(T),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionState {
    Running,
    Idle { stop_reason: Option<StopReason> },
    RequiresAction,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StopReason {
    EndTurn,
    MaxTokens,
    StopSequence,
    Cancelled,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Role {
    User,
    Agent,
    Thought,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "text")]
pub enum ContentBlock {
    Text(String),
    Code { language: Option<String>, code: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolCallPatch {
    pub name: Option<String>,
    pub input_json: Option<String>,
    pub status: ToolCallStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ToolCallStatus {
    Pending,
    Executing,
    Completed,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PermissionRequest {
    pub req_id: String,
    pub title: String,
    pub description: Option<String>,
    pub tool_name: Option<String>,
    pub command: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PermissionOutcome {
    Approved,
    Rejected,
    Cancelled,
}

/// Normalized event model per architecture §7.3.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", content = "body")]
pub enum TurnEventBody {
    StateChanged {
        state: SessionState,
    },
    MessageUpsert {
        message_id: String,
        role: Role,
        content: Patch<Vec<ContentBlock>>,
    },
    MessageChunk {
        message_id: String,
        role: Role,
        chunk: String,
    },
    ToolCallUpsert {
        tool_call_id: String,
        patch: ToolCallPatch,
    },
    PermissionRequested(PermissionRequest),
    PermissionResolved {
        req_id: String,
        outcome: PermissionOutcome,
    },
    GitPatchDiff {
        patch: String,
    },
    CheckpointCreated {
        checkpoint_ref: String,
    },
    Error {
        code: String,
        message: String,
        retryable: bool,
    },
}
