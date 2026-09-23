//! Workspace catalog wire types (`workspace.list`/`add`/`status`, M1.16).
//!
//! A sibling of `workspace.rs` (which owns the capability contract) so the
//! catalog and trust flow stay one chunk's file. `workspace.add` is the one
//! path-taking method; every other method identifies the workspace by
//! [`WorkspaceId`].

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::sync::WorkspaceId;
use crate::thread::ThreadState;
use crate::workspace::{PermissionMode, WorkspaceCapabilities};

/// Whether a workspace's stored trust decision still matches its folder.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum WorkspaceTrustState {
    /// A live trust row whose resolved path and remote still match.
    Trusted,
    /// No trust row: never added or revoked.
    Untrusted,
    /// Trusted once, but the resolved path or remote changed (re-prompt).
    Changed,
}

/// Scope a trust grant covers (`pages-views-spec.md` §2.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum TrustScope {
    Folder,
    Subtree,
}

/// The `workspace.add` request — the one path-taking method, because it *is*
/// the trust flow (`architecture.md` §1 principle 8's stated exception).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TrustGrant {
    /// The folder the user picked; Core canonicalizes it before trusting.
    pub path: String,
    pub permission_mode: PermissionMode,
    pub scope: TrustScope,
    /// Run `git init` in place when the folder is not a repository.
    #[serde(default)]
    pub init_git: bool,
}

/// One catalog card: a trusted, addressable workspace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct WorkspaceListItem {
    pub id: WorkspaceId,
    pub name: String,
    pub path: String,
    pub capabilities: WorkspaceCapabilities,
    pub trust: WorkspaceTrustState,
    pub sessions: Vec<WorkspaceSessionSummary>,
}

/// A live thread attached to a card. Branch, turn and diff are the session
/// surface's view (fixture-backed until the checkpoint, D12); this carries the
/// trustworthy identity and state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct WorkspaceSessionSummary {
    pub id: String,
    pub agent_profile_id: String,
    pub title: String,
    pub state: ThreadState,
    pub workdir: String,
}
