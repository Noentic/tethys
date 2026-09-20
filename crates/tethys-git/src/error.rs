//! Domain errors for the git engine.
//!
//! Library code returns [`GitError`]; hosts map it to `ApiError` at the
//! boundary. No `unwrap`/`expect` is allowed in production paths.

/// Result alias used across the crate.
pub type GitResult<T> = std::result::Result<T, GitError>;

/// Everything that can go wrong while driving git.
#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("not a git repository: {0}")]
    NotARepo(String),

    #[error("git {command} failed (exit {code:?}): {stderr}")]
    CommandFailed {
        command: String,
        code: Option<i32>,
        stderr: String,
    },

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("checkpoint not found: {0}")]
    CheckpointNotFound(String),

    #[error("delete blocked: {} uncommitted path(s), {} unpushed commit(s), leased={leased}",
        uncommitted.len(), unpushed.len())]
    DeleteBlocked {
        uncommitted: Vec<String>,
        unpushed: Vec<String>,
        leased: bool,
    },

    #[error("restore blocked: {0}")]
    RestoreBlocked(String),

    #[error("patch failed: {0}")]
    PatchFailed(String),

    #[error("nothing to commit")]
    NothingToCommit,

    #[error("invalid path: {0}")]
    InvalidPath(String),

    #[error("invalid argument: {0}")]
    InvalidArgument(String),

    #[error("worktree not found: {0}")]
    WorktreeNotFound(String),
}

impl GitError {
    /// Builds a `CommandFailed` from an executed git invocation.
    pub(crate) fn command(args: &[&str], output: &std::process::Output) -> Self {
        Self::CommandFailed {
            command: args.join(" "),
            code: output.status.code(),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        }
    }
}
