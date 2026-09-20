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
    MaxTurnRequests,
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

/// Closed ACP tool taxonomy, plus an open `Other` fallback.
///
/// Wire spellings are ACP's snake_case (`read`, `edit`, …, `other`), which is
/// what the v1 mapper already emitted as a bare string before this type landed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, Default)]
#[serde(rename_all = "snake_case")]
pub enum ToolKind {
    Read,
    Edit,
    Delete,
    Move,
    Search,
    Execute,
    Think,
    Fetch,
    SwitchMode,
    #[default]
    Other,
}

impl ToolKind {
    /// Parses an ACP tool-kind label, mapping anything unrecognised to `Other`.
    pub fn parse(value: &str) -> Self {
        match value {
            "read" => Self::Read,
            "edit" => Self::Edit,
            "delete" => Self::Delete,
            "move" => Self::Move,
            "search" => Self::Search,
            "execute" => Self::Execute,
            "think" => Self::Think,
            "fetch" => Self::Fetch,
            "switch_mode" => Self::SwitchMode,
            _ => Self::Other,
        }
    }
}

/// Where a tool call came from. Populated by Provider adapters (Wave 2.5);
/// no code in M1.6c sets it, and an entry with no `origin` is a built-in call.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ToolOrigin {
    Builtin,
    Mcp { server: String },
    Skill { name: String },
    Subagent,
}

/// A file location a tool call touched. Deserializes from either the new
/// `{ path, line }` object or the legacy bare path string.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct ToolLocation {
    pub path: String,
    pub line: Option<u32>,
}

impl<'de> Deserialize<'de> for ToolLocation {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Repr {
            Legacy(String),
            Full {
                path: String,
                #[serde(default)]
                line: Option<u32>,
            },
        }

        Ok(match Repr::deserialize(deserializer)? {
            Repr::Legacy(path) => Self { path, line: None },
            Repr::Full { path, line } => Self { path, line },
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type, Default)]
pub struct ToolCallPatch {
    pub title: Option<String>,
    pub kind: Option<ToolKind>,
    pub status: Option<ToolCallStatus>,
    pub input: Option<String>,
    pub output: Option<String>,
    #[serde(default)]
    pub origin: Option<ToolOrigin>,
    #[serde(default)]
    pub parent_tool_call_id: Option<String>,
    #[serde(default)]
    pub locations: Vec<ToolLocation>,
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

/// One selectable value of a [`ConfigOption`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ConfigOptionValue {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

/// Select vs boolean config option, for the composer's category-aware chips.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum ConfigOptionKind {
    Select,
    Boolean,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ConfigOption {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub current_value: String,
    /// Kept and still populated for existing readers; `value_options` adds the
    /// display names and descriptions beside it.
    pub values: Vec<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub kind: Option<ConfigOptionKind>,
    #[serde(default)]
    pub value_options: Vec<ConfigOptionValue>,
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
    /// Tokens currently in context: the v1 mapper stores ACP's `used` here and
    /// leaves `input_tokens` / `output_tokens` at 0 (see `tethys-acp` `map.rs`).
    pub total_tokens: u32,
    pub cost: Option<f64>,
    #[serde(default)]
    pub context_size: Option<u32>,
    #[serde(default)]
    pub cost_currency: Option<String>,
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
        /// The Provider's option that was chosen, when one was. Append-only
        /// field (M1.7) so a resolved card can name the auto-picked option.
        #[serde(default)]
        option_id: Option<String>,
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
    /// A vendor-extension request (`_`-prefixed ACP method). Appended last, an
    /// append-only region; transport is M1.17.
    ProviderExtension(crate::provider_extension::ProviderExtension),
    /// A Provider's context-compaction notice (unstable ACP `compaction_update`).
    Compaction {
        summary: Option<String>,
    },
    /// An elicitation request (`elicitation/create`). Appended last, an
    /// append-only region (M1.7).
    ElicitationRequested(crate::elicitation::ElicitationRequest),
    /// The user's answer to an elicitation. Appended last (M1.7).
    ElicitationResolved {
        req_id: String,
        outcome: crate::elicitation::ElicitationOutcome,
        values: std::collections::BTreeMap<String, crate::elicitation::ElicitationValue>,
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
    Elicitation {
        req_id: String,
        request: crate::elicitation::ElicitationRequest,
        outcome: Option<crate::elicitation::ElicitationOutcome>,
        values: std::collections::BTreeMap<String, crate::elicitation::ElicitationValue>,
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
            Entry::Elicitation { req_id, .. } => req_id,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_tool_call_payload_still_deserializes() {
        let json = r#"{"title":"Read file","kind":"read","status":"Completed","input":null,"output":null,"locations":["src/a.rs"]}"#;
        let patch: ToolCallPatch = serde_json::from_str(json).expect(json);
        assert_eq!(patch.kind, Some(ToolKind::Read));
        assert_eq!(patch.locations, vec![ToolLocation { path: "src/a.rs".into(), line: None }]);
        assert_eq!(patch.origin, None);
        assert_eq!(patch.parent_tool_call_id, None);
    }

    #[test]
    fn tool_location_keeps_line_and_accepts_both_shapes() {
        let legacy: ToolLocation = serde_json::from_str("\"src/a.rs\"").expect("legacy");
        assert_eq!(legacy, ToolLocation { path: "src/a.rs".into(), line: None });
        let full: ToolLocation =
            serde_json::from_str(r#"{"path":"src/b.rs","line":42}"#).expect("full");
        assert_eq!(full, ToolLocation { path: "src/b.rs".into(), line: Some(42) });
    }

    #[test]
    fn tool_kind_parse_falls_back_to_other() {
        for kind in [
            ToolKind::Read,
            ToolKind::Edit,
            ToolKind::Delete,
            ToolKind::Move,
            ToolKind::Search,
            ToolKind::Execute,
            ToolKind::Think,
            ToolKind::Fetch,
            ToolKind::SwitchMode,
            ToolKind::Other,
        ] {
            let label = serde_json::to_value(kind).expect("serialize");
            let label = label.as_str().expect("string");
            assert_eq!(ToolKind::parse(label), kind);
        }
        assert_eq!(ToolKind::parse("future_kind"), ToolKind::Other);
    }

    #[test]
    fn config_option_without_new_fields_deserializes() {
        let json = r#"{"id":"model","name":"Model","description":null,"current_value":"sonnet","values":["sonnet","opus"]}"#;
        let option: ConfigOption = serde_json::from_str(json).expect(json);
        assert_eq!(option.category, None);
        assert_eq!(option.kind, None);
        assert!(option.value_options.is_empty());
    }

    #[test]
    fn usage_snapshot_gains_context_size_and_currency() {
        let snapshot: UsageSnapshot = serde_json::from_str(
            r#"{"input_tokens":0,"output_tokens":0,"total_tokens":10,"cost":0.5,"context_size":200000,"cost_currency":"USD"}"#,
        )
        .expect("usage");
        assert_eq!(snapshot.context_size, Some(200000));
        assert_eq!(snapshot.cost_currency.as_deref(), Some("USD"));
    }

    #[test]
    fn provider_extension_and_compaction_events_round_trip() {
        let ext = TurnEventBody::ProviderExtension(crate::provider_extension::ProviderExtension {
            provider_id: "kiro".into(),
            method: "_kiro.dev/mcp/oauth_request".into(),
            params: "{}".into(),
        });
        let value = serde_json::to_value(&ext).expect("serialize");
        assert_eq!(serde_json::from_value::<TurnEventBody>(value).expect("round"), ext);

        let compaction = TurnEventBody::Compaction { summary: None };
        let value = serde_json::to_value(&compaction).expect("serialize");
        assert_eq!(
            serde_json::from_value::<TurnEventBody>(value).expect("round"),
            compaction
        );
    }
}
