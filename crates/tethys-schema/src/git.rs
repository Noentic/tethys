//! Git domain wire types (M1.3, `architecture.md` §10).
//!
//! These are the only git shapes crossing the IPC boundary. `tethys-git`
//! speaks them directly so the command contract cannot drift from the engine.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Per-project git settings loaded from `<repo>/.tethys/config.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(default)]
pub struct WorkspaceGitConfig {
    /// Override for the default `~/.tethys/worktrees/<repo-id>/<slug>` location.
    pub worktrees_dir: Option<String>,
    /// Branch template for new thread worktrees; `{slug}` is substituted.
    pub wt_branch_template: String,
    /// Untracked/ignored globs copied from the main worktree (default `.env*`).
    pub bootstrap_globs: Vec<String>,
    /// Untracked binaries larger than this are skipped by checkpoints.
    pub skip_untracked_binary_bytes: u32,
    /// Timeout for the optional worktree setup script.
    pub setup_timeout_ms: u32,
}

pub type ProjectGitConfig = WorkspaceGitConfig;

impl Default for WorkspaceGitConfig {
    fn default() -> Self {
        Self {
            worktrees_dir: None,
            wt_branch_template: "tethys/{slug}".to_string(),
            bootstrap_globs: vec![".env*".to_string()],
            skip_untracked_binary_bytes: 10 * 1024 * 1024,
            setup_timeout_ms: 120_000,
        }
    }
}

/// Everything the engine needs to materialize a thread worktree.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct WorktreeSpec {
    pub thread_id: String,
    /// Workspace ID whose root is resolved in Core.
    pub workspace_id: crate::sync::WorkspaceId,
    /// URL-safe thread slug used for paths and default branch names.
    pub slug: String,
    /// Worktree path; empty means "derive from `worktrees_dir`".
    pub path: String,
    /// Branch to create; empty means "apply the configured template".
    pub branch: String,
    /// Commit-ish the branch starts from.
    pub base: String,
    /// Ignored-file globs copied into the new worktree.
    pub bootstrap_globs: Vec<String>,
    /// Optional synchronization script run inside the new worktree.
    pub setup_script: Option<String>,
    /// When true, register the existing checkout instead of creating a worktree.
    pub main_checkout: bool,
}

/// Result of materializing a worktree.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct WorktreeInfo {
    pub thread_id: String,
    pub workspace_root: String,
    pub path: String,
    pub branch: String,
    pub base: String,
    pub head: String,
    pub main_checkout: bool,
    pub warnings: Vec<String>,
    pub setup: Option<SetupOutcome>,
}

/// Outcome of an optional worktree setup script.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct SetupOutcome {
    pub exit_code: Option<i32>,
    pub stderr: String,
    pub timed_out: bool,
}

/// Which edge of a turn a checkpoint captures.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
pub enum CheckpointPhase {
    Start,
    End,
}

/// One checkpoint ref, newest fields resolved.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct CheckpointInfo {
    pub thread_id: String,
    pub turn: u32,
    pub phase: CheckpointPhase,
    pub commit_oid: String,
    pub tree_oid: String,
    pub created_at_ms: f64,
}

/// Result of writing a checkpoint.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct CheckpointResult {
    pub thread_id: String,
    pub turn: u32,
    pub phase: CheckpointPhase,
    pub ref_name: String,
    pub commit_oid: String,
    pub tree_oid: String,
    pub elapsed_ms: f64,
    /// Untracked binaries too large to capture; they remain on disk.
    pub skipped: Vec<String>,
}

/// Anchor pair a diff is computed between (`architecture.md` §10.1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum DiffSource {
    /// Base commit to the thread's latest end checkpoint.
    BaseLatestEnd { thread_id: String, base: String },
    /// Base commit to the live worktree (fallback before the first end).
    BaseWorktree { thread_id: String, base: String },
    /// Turn start checkpoint to turn end checkpoint.
    TurnStartEnd { thread_id: String, turn: u32 },
    /// Turn start checkpoint to the live worktree (in-progress turn).
    TurnStartWorktree { thread_id: String, turn: u32 },
    /// HEAD to the real index.
    HeadIndex { thread_id: String },
    /// HEAD to the live worktree.
    HeadWorktree { thread_id: String },
    /// Real index to the live worktree.
    IndexWorktree { thread_id: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum DiffFileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    TypeChanged,
    Unmerged,
    Other,
}

/// One file in a diff summary.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct DiffFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: DiffFileStatus,
    pub additions: u32,
    pub deletions: u32,
    pub binary: bool,
    /// True when content is withheld (>1 MB or >20k changed lines).
    pub collapsed: bool,
}

/// Aggregated diff for one anchor pair.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct DiffSummary {
    pub source: DiffSource,
    pub files: Vec<DiffFile>,
    pub additions: u32,
    pub deletions: u32,
}

/// Full content diff for a single file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct DiffFileDetail {
    pub path: String,
    pub binary: bool,
    pub collapsed: bool,
    pub additions: u32,
    pub deletions: u32,
    pub hunks: Vec<crate::DiffHunk>,
}

/// Identifies one hunk for discard operations.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct HunkRef {
    pub path: String,
    pub hunk_index: u32,
}

/// Result of a commit on a thread branch.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct CommitResult {
    pub oid: String,
    pub summary: String,
    /// Number of commits between the thread's starting point and its current head.
    pub ahead_of_base: u32,
}

/// How aggressively restore protects uncommitted state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum RestorePolicy {
    /// Refuse unless worktree and index match the latest end checkpoint.
    RequireClean,
    /// Proceed after capturing an undo checkpoint.
    Force,
}

/// What to restore to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum RestoreTarget {
    Checkpoint {
        thread_id: String,
        turn: u32,
        phase: CheckpointPhase,
    },
    /// Explicit trees, used to undo a previous restore.
    Trees {
        thread_id: String,
        worktree_tree: String,
        index_tree: String,
    },
}

/// Refs holding the pre-restore state so restore is itself reversible.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct UndoCapture {
    pub worktree_ref: String,
    pub index_ref: String,
    pub worktree_tree: String,
    pub index_tree: String,
}

/// Result of a restore.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct RestoreOutcome {
    pub restored_worktree_tree: String,
    pub restored_index_tree: String,
    pub undo: UndoCapture,
}
