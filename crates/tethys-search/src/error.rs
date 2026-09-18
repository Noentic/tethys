//! Search domain errors.

use std::path::PathBuf;

/// Failures from the worktree search index lifecycle and queries.
#[derive(Debug, thiserror::Error)]
pub enum SearchError {
    /// The worktree index exists but its initial scan has not finished within
    /// the caller's deadline; the UI should retry shortly.
    #[error("search index for {} is still warming up", path.display())]
    IndexWarming { path: PathBuf },
    /// Filesystem failure while keying or opening a worktree root.
    #[error("search io at {}: {source}", path.display())]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    /// Failure reported by the underlying FFF picker.
    #[error("file picker: {0}")]
    Picker(String),
}
