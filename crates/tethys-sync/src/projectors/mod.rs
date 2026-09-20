//! Per-target projectors: field mapping and format-preserving injection.

mod claude_code;
pub(crate) use claude_code::entry_from_value;
mod codex;
mod opencode;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use tethys_schema::sync::{RegistryEntry, RegistryValue, Scope, TargetId, TransportKind};

use crate::error::SyncError;

pub use claude_code::ClaudeCodeProjector;
pub use codex::CodexProjector;
pub use opencode::OpenCodeProjector;

/// One vendor config file a projector can read or write.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TargetFile {
    pub path: PathBuf,
    pub scope: Scope,
}

/// Maps registry entries into one target's config file format.
pub trait Projector: Send + Sync {
    fn target(&self) -> TargetId;

    /// Candidate config files for `root`, preferring an existing file.
    fn detect(&self, root: &Path, home: &Path) -> Vec<TargetFile>;

    /// Returns the file text with `entry` injected under `name`.
    fn inject(
        &self,
        original: &str,
        name: &str,
        entry: &RegistryEntry,
    ) -> Result<String, SyncError>;

    /// Returns the file text with `name` removed.
    fn rollback(&self, modified: &str, name: &str) -> Result<String, SyncError>;

    /// Reads foreign and owned entries for drift detection and import.
    fn read_entries(&self, original: &str) -> Result<BTreeMap<String, RegistryEntry>, SyncError>;
}

/// All file projectors, in a stable order.
pub fn projectors() -> Vec<Box<dyn Projector>> {
    vec![
        Box::new(ClaudeCodeProjector),
        Box::new(CodexProjector),
        Box::new(OpenCodeProjector),
    ]
}

/// Resolves one file projector by target.
pub fn projector_for(target: TargetId) -> Option<Box<dyn Projector>> {
    match target {
        TargetId::ClaudeCode => Some(Box::new(ClaudeCodeProjector)),
        TargetId::Codex => Some(Box::new(CodexProjector)),
        TargetId::OpenCode => Some(Box::new(OpenCodeProjector)),
        TargetId::Session => None,
    }
}

/// Renders a value the way Claude Code expects: literal or `${KEY}`.
pub(crate) fn claude_ref(key: &str, value: &RegistryValue) -> String {
    match value {
        RegistryValue::Plain(text) => text.clone(),
        RegistryValue::Secret { .. } => format!("${{{key}}}"),
    }
}

/// Renders a value the way OpenCode expects: literal or `{env:KEY}`.
pub(crate) fn opencode_ref(key: &str, value: &RegistryValue) -> String {
    match value {
        RegistryValue::Plain(text) => text.clone(),
        RegistryValue::Secret { .. } => format!("{{env:{key}}}"),
    }
}

/// First secret-valued env key, used for Codex bearer auth.
pub(crate) fn secret_env_key(entry: &RegistryEntry) -> Option<&str> {
    entry
        .env
        .iter()
        .find(|(_, value)| value.secret_ref().is_some())
        .map(|(key, _)| key.as_str())
}

/// Inverse of [`claude_ref`] / [`opencode_ref`]: maps indirection to a keychain ref.
pub(crate) fn import_value(text: &str) -> RegistryValue {
    if let Some(inner) = text
        .strip_prefix("${")
        .and_then(|rest| rest.strip_suffix('}'))
    {
        let key = inner.split(":-").next().unwrap_or(inner);
        return RegistryValue::secret(format!("keychain:tethys/{key}"));
    }
    if let Some(inner) = text
        .strip_prefix("{env:")
        .and_then(|rest| rest.strip_suffix('}'))
    {
        return RegistryValue::secret(format!("keychain:tethys/{inner}"));
    }
    RegistryValue::Plain(text.to_string())
}

/// Transport inferred from a raw entry shape when no explicit type is present.
pub(crate) fn infer_transport(
    explicit: Option<&str>,
    has_url: bool,
    has_command: bool,
) -> TransportKind {
    match explicit {
        Some("http") | Some("remote") => TransportKind::Http,
        Some("sse") => TransportKind::Sse,
        Some("stdio") | Some("local") => TransportKind::Stdio,
        _ => {
            if has_url && !has_command {
                TransportKind::Http
            } else {
                TransportKind::Stdio
            }
        }
    }
}
