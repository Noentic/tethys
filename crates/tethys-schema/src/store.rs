//! Store & event log wire types (Rust ↔ TypeScript).
//!
//! Types declared here cross IPC boundaries for persistence, thread viewing,
//! and event replay.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Thread identifier.
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

impl From<String> for ThreadId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for ThreadId {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl std::fmt::Display for ThreadId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::ops::Deref for ThreadId {
    type Target = str;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// Content-addressed blob identifier (hex-encoded BLAKE3 hash).
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Type)]
#[serde(transparent)]
pub struct BlobHash(pub String);

impl BlobHash {
    pub fn new(hash: impl Into<String>) -> Self {
        Self(hash.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<String> for BlobHash {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for BlobHash {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl std::fmt::Display for BlobHash {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::ops::Deref for BlobHash {
    type Target = str;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// Sequence range assigned to a batch of events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SeqRange {
    #[specta(type = u32)]
    pub first: u64,
    #[specta(type = u32)]
    pub last: u64,
}

/// Category of materialized entry in a thread transcript.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum EntryKind {
    Message,
    ToolCall,
    Plan,
    Terminal,
}

impl EntryKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Message => "message",
            Self::ToolCall => "tool_call",
            Self::Plan => "plan",
            Self::Terminal => "terminal",
        }
    }
}

impl std::fmt::Display for EntryKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for EntryKind {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "message" => Ok(Self::Message),
            "tool_call" => Ok(Self::ToolCall),
            "plan" => Ok(Self::Plan),
            "terminal" => Ok(Self::Terminal),
            other => Err(format!("unknown entry kind: {other}")),
        }
    }
}

/// Payload for creating or updating a materialized entry alongside an event append.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct EntryUpsert {
    pub kind: EntryKind,
    pub entry_id: String,
    pub turn_index: Option<u32>,
    pub payload: String,
}

/// A new event to be appended to a thread's event log.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct NewEvent {
    pub kind: String,
    pub payload: String,
    pub entry: Option<EntryUpsert>,
}

/// Materialized thread entry representation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Entry {
    pub thread_id: ThreadId,
    pub kind: EntryKind,
    pub entry_id: String,
    #[specta(type = u32)]
    pub first_seq: u64,
    #[specta(type = u32)]
    pub last_seq: u64,
    pub turn_index: Option<u32>,
    pub payload: String,
}

/// Request parameters for a page of materialized entries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct EntryPage {
    #[specta(type = Option<u32>)]
    pub before_first_seq: Option<u64>,
    pub limit: u32,
}

/// Result of opening a thread, containing materialized entries and tail sequence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ThreadView {
    pub entries: Vec<Entry>,
    #[specta(type = u32)]
    pub latest_seq: u64,
    pub has_more: bool,
}

/// An immutable event stored in the append-only event log.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct StoredEvent {
    #[specta(type = i32)]
    pub id: i64,
    pub thread_id: ThreadId,
    #[specta(type = u32)]
    pub seq: u64,
    pub event_type: String,
    pub payload: String,
    #[specta(type = i32)]
    pub created_at: i64,
}
