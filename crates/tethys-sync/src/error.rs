//! Domain errors for the sync engine.

use thiserror::Error;

/// Errors produced by registry, projection, secret, and skill operations.
#[derive(Debug, Error)]
pub enum SyncError {
    #[error("invalid registry: {0}")]
    Registry(String),

    #[error("invalid config {path}: {message}")]
    Parse { path: String, message: String },

    #[error("unsupported: {0}")]
    Unsupported(String),

    #[error("unsupported source: {0}")]
    UnsupportedSource(String),

    #[error("stale plan for {path}: the file changed after the plan was created")]
    StalePlan { path: String },

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("missing secret reference(s): {}", .refs.join(", "))]
    MissingSecrets { refs: Vec<String> },

    #[error("secret store: {0}")]
    SecretStore(String),

    #[error("archive rejected: {0}")]
    UnsafeArchive(String),

    #[error("git: {0}")]
    Git(String),

    #[error("git binary not found")]
    GitMissing,

    #[error("network: {0}")]
    Network(String),

    #[error("skill not found: {name}")]
    SkillNotFound { name: String },

    #[error("not found: {0}")]
    NotFound(String),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("store error: {0}")]
    Store(#[from] tethys_store::StoreError),
}
