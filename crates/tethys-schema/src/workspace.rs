//! Workspace capability contract (`workspace.capabilities`, AD-15, §10.6).
//!
//! One resolved capability set describes a folder: its version control, whether
//! a session can restore, and how many sessions may run at once. Every gate
//! reads this set; no surface re-derives VCS status itself.
//!
//! The `isolation` and `forge_cli` inputs from §10.6 are V1 (`WT-11`); only the
//! MVP inputs are declared here.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Resolved capabilities for one workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct WorkspaceCapabilities {
    /// Version control the folder is under, and the remote host if any.
    pub vcs: Vcs,
    /// Checkpoints exist and the session can restore them.
    pub restore: bool,
    /// `Some(1)` where no worktree mechanism isolates parallel sessions.
    pub max_concurrent_sessions: Option<u32>,
}

/// Version control state of a workspace root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Vcs {
    /// Not a git repository.
    None,
    /// A git repository with no remote configured.
    GitLocal,
    /// A git repository with a remote; `host` drives the source badge.
    GitRemote { host: GitHost },
}

/// Host of a workspace's git remote (read-only; never an entry point).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum GitHost {
    Github,
    Gitlab,
    Other,
}

/// Permission policy a thread runs under (`thread.set_permission_mode`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum PermissionMode {
    Supervised,
    AutoEdit,
    Yolo,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capability_shapes_round_trip() {
        let cases: [(&str, Vcs, bool, Option<u32>); 5] = [
            (
                r#"{"vcs":{"kind":"none"},"restore":false,"max_concurrent_sessions":1}"#,
                Vcs::None,
                false,
                Some(1),
            ),
            (
                r#"{"vcs":{"kind":"git-local"},"restore":true,"max_concurrent_sessions":null}"#,
                Vcs::GitLocal,
                true,
                None,
            ),
            (
                r#"{"vcs":{"kind":"git-remote","host":"github"},"restore":true,"max_concurrent_sessions":null}"#,
                Vcs::GitRemote {
                    host: GitHost::Github,
                },
                true,
                None,
            ),
            (
                r#"{"vcs":{"kind":"git-remote","host":"gitlab"},"restore":false,"max_concurrent_sessions":null}"#,
                Vcs::GitRemote {
                    host: GitHost::Gitlab,
                },
                false,
                None,
            ),
            (
                r#"{"vcs":{"kind":"git-remote","host":"other"},"restore":false,"max_concurrent_sessions":null}"#,
                Vcs::GitRemote {
                    host: GitHost::Other,
                },
                false,
                None,
            ),
        ];

        for (json, vcs, restore, max) in cases {
            let parsed: WorkspaceCapabilities = serde_json::from_str(json).expect(json);
            assert_eq!(parsed.vcs, vcs);
            assert_eq!(parsed.restore, restore);
            assert_eq!(parsed.max_concurrent_sessions, max);
            assert_eq!(
                serde_json::to_value(&parsed).expect("serialize"),
                serde_json::from_str::<serde_json::Value>(json).expect("value"),
            );
        }
    }

    #[test]
    fn permission_mode_uses_kebab_case() {
        assert_eq!(
            serde_json::to_value(PermissionMode::Supervised).expect("serialize"),
            serde_json::json!("supervised"),
        );
        assert_eq!(
            serde_json::to_value(PermissionMode::AutoEdit).expect("serialize"),
            serde_json::json!("auto-edit"),
        );
        assert_eq!(
            serde_json::to_value(PermissionMode::Yolo).expect("serialize"),
            serde_json::json!("yolo"),
        );
        assert!(serde_json::from_str::<PermissionMode>("\"Supervised\"").is_err());
    }
}
