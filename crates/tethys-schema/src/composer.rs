//! Composer wire types (`commands.list`, `commands.expand`; M1.5, `architecture.md` §7.8).
//!
//! Every resolved prompt is plaintext. `ComposerReference` is UI-only metadata
//! (chips, icons, method badges) and is never injected into the prompt text.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Where a discovered Tethys command lives.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum CommandScope {
    Global,
    Workspace,
}

impl<'de> Deserialize<'de> for CommandScope {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        match s.as_str() {
            "global" => Ok(CommandScope::Global),
            "workspace" | "project" => Ok(CommandScope::Workspace),
            _ => Err(serde::de::Error::custom(format!(
                "unknown command scope: {s}"
            ))),
        }
    }
}

/// One discovered `/` Tethys command (CMP-01).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CommandInfo {
    pub name: String,
    pub scope: CommandScope,
    pub path: String,
}

/// What a resolved composer reference points at.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum ReferenceKind {
    Skill,
    Path,
}

/// UI metadata for one resolved `$skill` or `@path` reference.
///
/// This travels alongside the plaintext prompt for rendering only. `path` is a
/// worktree-relative path for `Path` references and a skill directory for
/// `Skill` references. `mime`/`size` are `None` for directories.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ComposerReference {
    pub kind: ReferenceKind,
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub mime: Option<String>,
    /// Byte size for files; `None` for directories. `f64` keeps the wire type
    /// JSON-native (specta forbids exporting `u64`).
    pub size: Option<f64>,
}

/// The result of expanding a `/` command: the plaintext prompt plus UI metadata.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ExpandedCommand {
    pub text: String,
    pub references: Vec<ComposerReference>,
}
