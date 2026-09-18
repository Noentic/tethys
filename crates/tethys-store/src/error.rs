//! Error types for `tethys-store`.
//!
//! Exposes domain errors via `thiserror` without leaking internal driver types.

use thiserror::Error;

/// Errors produced by store operations.
#[derive(Debug, Error)]
pub enum StoreError {
    #[error("migration error: {0}")]
    Migration(String),

    #[error("sequence conflict: expected {expected}, found {found}")]
    SeqConflict { expected: u64, found: u64 },

    #[error("blob hash mismatch: expected {expected}, calculated {found}")]
    BlobHashMismatch { expected: String, found: String },

    #[error("database busy")]
    Busy,

    #[error("not found: {0}")]
    NotFound(String),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("database error: {0}")]
    Sqlite(String),

    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

impl From<rusqlite::Error> for StoreError {
    fn from(err: rusqlite::Error) -> Self {
        match err {
            rusqlite::Error::SqliteFailure(err, _)
                if err.extended_code == rusqlite::ffi::SQLITE_BUSY =>
            {
                Self::Busy
            }
            other => Self::Sqlite(other.to_string()),
        }
    }
}

impl From<tokio_rusqlite::Error<rusqlite::Error>> for StoreError {
    fn from(err: tokio_rusqlite::Error<rusqlite::Error>) -> Self {
        match err {
            tokio_rusqlite::Error::Error(r) => r.into(),
            tokio_rusqlite::Error::ConnectionClosed => Self::Sqlite("connection closed".into()),
            tokio_rusqlite::Error::Close((_, e)) => Self::Sqlite(e.to_string()),
            other => Self::Sqlite(other.to_string()),
        }
    }
}

impl From<tokio_rusqlite::Error<StoreError>> for StoreError {
    fn from(err: tokio_rusqlite::Error<StoreError>) -> Self {
        match err {
            tokio_rusqlite::Error::Error(e) => e,
            tokio_rusqlite::Error::ConnectionClosed => Self::Sqlite("connection closed".into()),
            tokio_rusqlite::Error::Close((_, e)) => Self::Sqlite(e.to_string()),
            other => Self::Sqlite(other.to_string()),
        }
    }
}
