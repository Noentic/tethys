//! Sync engine wire types (M1.4, `architecture.md` §11).
//!
//! These are the only sync shapes crossing the IPC boundary. `tethys-sync`
//! speaks them directly so the command contract cannot drift from the engine.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use specta::Type;

/// Stable workspace identifier.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Type)]
#[serde(transparent)]
pub struct WorkspaceId(pub String);

impl WorkspaceId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for WorkspaceId {
    fn from(value: &str) -> Self {
        Self(value.to_string())
    }
}

impl From<String> for WorkspaceId {
    fn from(value: String) -> Self {
        Self(value)
    }
}

impl std::fmt::Display for WorkspaceId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl AsRef<str> for WorkspaceId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

/// A file surface that a registry entry can be projected to.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Type,
)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectionTarget {
    ClaudeCode,
    Codex,
    OpenCode,
}

impl ProjectionTarget {
    pub const FILES: [ProjectionTarget; 3] = [
        ProjectionTarget::ClaudeCode,
        ProjectionTarget::Codex,
        ProjectionTarget::OpenCode,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            ProjectionTarget::ClaudeCode => "claude-code",
            ProjectionTarget::Codex => "codex",
            ProjectionTarget::OpenCode => "opencode",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "claude-code" => Some(ProjectionTarget::ClaudeCode),
            "codex" => Some(ProjectionTarget::Codex),
            "opencode" => Some(ProjectionTarget::OpenCode),
            _ => None,
        }
    }
}

/// A file surface or session that a registry entry can be projected to (legacy).
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, Type,
)]
#[serde(rename_all = "kebab-case")]
pub enum TargetId {
    Session,
    ClaudeCode,
    Codex,
    OpenCode,
}

impl TargetId {
    /// Targets that own a config file (not the session handoff).
    pub const FILES: [TargetId; 3] = [TargetId::ClaudeCode, TargetId::Codex, TargetId::OpenCode];

    /// Wire name used in `x-tethys.targets`.
    pub fn as_str(self) -> &'static str {
        match self {
            TargetId::Session => "session",
            TargetId::ClaudeCode => "claude-code",
            TargetId::Codex => "codex",
            TargetId::OpenCode => "opencode",
        }
    }

    /// Parses the wire name.
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "session" => Some(TargetId::Session),
            "claude-code" => Some(TargetId::ClaudeCode),
            "codex" => Some(TargetId::Codex),
            "opencode" => Some(TargetId::OpenCode),
            _ => None,
        }
    }
}

/// MCP transport of a registry entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum TransportKind {
    Stdio,
    Http,
    Sse,
}

impl TransportKind {
    pub fn as_str(self) -> &'static str {
        match self {
            TransportKind::Stdio => "stdio",
            TransportKind::Http => "http",
            TransportKind::Sse => "sse",
        }
    }
}

/// Registry file location an entry came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum Scope {
    Global,
    Workspace,
}

impl<'de> Deserialize<'de> for Scope {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        match Scope::parse(&s) {
            Some(scope) => Ok(scope),
            None => Err(serde::de::Error::custom(format!("unknown scope: {s}"))),
        }
    }
}

impl Scope {
    pub fn as_str(self) -> &'static str {
        match self {
            Scope::Global => "global",
            Scope::Workspace => "workspace",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "global" => Some(Scope::Global),
            "workspace" | "project" => Some(Scope::Workspace),
            _ => None,
        }
    }
}

/// A registry value: a literal string or a keychain reference.
///
/// Serializes the canonical `{"secretRef":"keychain:tethys/<name>"}` shape.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(untagged)]
pub enum RegistryValue {
    Plain(String),
    Secret {
        #[serde(rename = "secretRef")]
        secret_ref: String,
    },
}

impl RegistryValue {
    pub fn plain(value: impl Into<String>) -> Self {
        Self::Plain(value.into())
    }

    pub fn secret(secret_ref: impl Into<String>) -> Self {
        Self::Secret {
            secret_ref: secret_ref.into(),
        }
    }

    pub fn as_plain(&self) -> Option<&str> {
        match self {
            Self::Plain(value) => Some(value),
            Self::Secret { .. } => None,
        }
    }

    pub fn secret_ref(&self) -> Option<&str> {
        match self {
            Self::Plain(_) => None,
            Self::Secret { secret_ref } => Some(secret_ref),
        }
    }
}

/// Per-entry Tethys metadata (`x-tethys`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct EntryMeta {
    #[serde(default)]
    pub scope: Option<Scope>,
    #[serde(default)]
    pub targets: Option<Vec<TargetId>>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub legacy: bool,
}

fn default_enabled() -> bool {
    true
}

impl Default for EntryMeta {
    fn default() -> Self {
        Self {
            scope: None,
            targets: None,
            enabled: true,
            legacy: false,
        }
    }
}

impl EntryMeta {
    /// Whether this entry should be projected to `target`.
    pub fn allows(&self, target: TargetId) -> bool {
        match &self.targets {
            None => true,
            Some(targets) => targets.contains(&target),
        }
    }
}

/// One canonical MCP registry entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct RegistryEntry {
    #[serde(rename = "type")]
    pub transport: TransportKind,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: BTreeMap<String, RegistryValue>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub headers: BTreeMap<String, RegistryValue>,
    #[serde(rename = "x-tethys", default)]
    pub meta: EntryMeta,
}

/// Transports an agent advertised for a session.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct McpTransports {
    pub stdio: bool,
    pub http: bool,
    pub sse: bool,
}

impl McpTransports {
    pub fn all() -> Self {
        Self {
            stdio: true,
            http: true,
            sse: true,
        }
    }
}

/// One MCP server handed to an agent session.
///
/// Values are `Secret` until `resolve_secrets` runs at spawn; a resolved
/// server carries only `Plain` values and is never written to disk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SessionServer {
    pub name: String,
    pub transport: TransportKind,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: BTreeMap<String, RegistryValue>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub headers: BTreeMap<String, RegistryValue>,
}

/// Per-entry projection state in a plan.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum EntryState {
    Pending,
    InSync,
    Drifted,
    Conflict,
    Unsupported,
}

/// One entry's state inside a projection plan.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct EntryProjection {
    pub name: String,
    pub state: EntryState,
    /// Whether this entry is part of the proposed file content.
    pub projected: bool,
    #[serde(default)]
    pub notes: Vec<String>,
}

/// Preview of one projected registry into one target file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ProjectionPlan {
    pub target: TargetId,
    pub path: String,
    pub scope: Scope,
    pub base_hash: String,
    pub created: bool,
    pub diff: String,
    pub content: String,
    pub entries: Vec<EntryProjection>,
}

/// Manifest record for one applied projection.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Applied {
    pub target: TargetId,
    pub path: String,
    pub scope: Scope,
    pub file_hash: String,
    pub created: bool,
    #[serde(default)]
    pub entries: BTreeMap<String, String>,
}

/// Result of verifying a projected file against its manifest entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum VerifyStatus {
    InSync,
    Drifted,
    Missing,
}

/// One MCP server detected in a foreign config file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ImportCandidate {
    pub name: String,
    pub entry: RegistryEntry,
    pub source_path: String,
    pub scope: Scope,
    pub conflict: bool,
}

/// One source file that could not be scanned.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ImportFailure {
    pub source_path: String,
    pub message: String,
}

/// Read-only scan across every detected tool config.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ImportScan {
    pub candidates: Vec<ImportCandidate>,
    pub failures: Vec<ImportFailure>,
}

/// Where a skill came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum SkillOrigin {
    Folder,
    Archive,
    GitHub,
    Lockfile,
}

/// Skill provenance (`skills_state.source` JSON).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SkillSource {
    pub origin: SkillOrigin,
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub reference: Option<String>,
    #[serde(default)]
    pub subdir: Option<String>,
    #[serde(default)]
    pub lock_hash: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
}

/// One skill in the canonical home.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SkillInfo {
    pub name: String,
    pub scope: Scope,
    pub path: String,
    pub source: SkillSource,
    pub enabled: bool,
    pub requires_trust: bool,
    pub trusted: bool,
    pub content_hash: String,
    #[serde(default)]
    pub pinned_sha: Option<String>,
}

/// One registry entry with its scope and name, for the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct RegistryEntryView {
    pub name: String,
    pub scope: Scope,
    pub entry: RegistryEntry,
}

/// Where `skills.import` should load from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum SkillImportSource {
    Folder { path: String },
    Archive { path: String },
    GitHub { spec: String },
}

/// Cheap upstream check for one skill.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SkillUpdateCheck {
    pub name: String,
    #[serde(default)]
    pub pinned_sha: Option<String>,
    #[serde(default)]
    pub upstream_sha: Option<String>,
    pub update_available: bool,
    #[serde(default)]
    pub error: Option<String>,
}

/// Download-and-diff preview for one skill update.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SkillUpdatePlan {
    pub name: String,
    pub upstream_sha: String,
    pub changed_files: Vec<String>,
    pub diff: String,
}

/// Result of applying one skill update.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SkillUpdateApplied {
    pub name: String,
    pub pinned_sha: String,
    pub content_hash: String,
}
