//! Workspace trust port (`architecture.md` §12, `pages-views-spec.md` §2.1).
//!
//! Trust is the gate principle 8 routes every filesystem namespace through:
//! the `WorkspaceRoots` resolver consults this port and returns `NotFound` for
//! a workspace without a live decision. Revocation is a row delete, so
//! re-trusting re-inserts and the card returns.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use parking_lot::RwLock;
use tethys_api::ApiError;
use tethys_schema::catalog::WorkspaceTrustState;
use tethys_schema::sync::WorkspaceId;
use tethys_store::{EventStore, TrustRow};

/// Whether a stored decision still describes the folder on disk: the resolved
/// path (canonicalized now) and the read-only `origin` URL both match.
pub fn row_matches(record: &TrustRow, root: &Path) -> bool {
    let resolved = crate::normalize_path(root);
    if resolved.as_path() != Path::new(&record.resolved_path) {
        return false;
    }
    let current = tethys_git::remote_url(&resolved, "origin").ok().flatten();
    current == record.remote_url
}

/// Classifies a workspace's trust for a given current root path.
pub fn trust_state(record: Option<&TrustRow>, root: &Path) -> WorkspaceTrustState {
    match record {
        Some(row) if row_matches(row, root) => WorkspaceTrustState::Trusted,
        Some(_) => WorkspaceTrustState::Changed,
        None => WorkspaceTrustState::Untrusted,
    }
}

/// [`trust_state`] off the async worker: the comparison runs a read-only git
/// read, so it must not block an async thread (the repo's `blocking`
/// convention). A failed join fails closed (`Untrusted`).
pub async fn trust_state_async(
    record: Option<TrustRow>,
    root: PathBuf,
) -> WorkspaceTrustState {
    match tokio::task::spawn_blocking(move || trust_state(record.as_ref(), &root)).await {
        Ok(state) => state,
        Err(_) => WorkspaceTrustState::Untrusted,
    }
}

/// Grants, reads, and revokes workspace trust decisions.
#[async_trait::async_trait]
pub trait WorkspaceTrust: Send + Sync {
    async fn grant(&self, row: TrustRow) -> Result<(), ApiError>;
    async fn trust(&self, id: &WorkspaceId) -> Result<Option<TrustRow>, ApiError>;
    async fn revoke(&self, id: &WorkspaceId) -> Result<(), ApiError>;
    async fn list(&self) -> Result<Vec<TrustRow>, ApiError>;
}

/// Store-backed trust port (reads and writes the `workspace_trust` table).
pub struct StoreWorkspaceTrust {
    store: EventStore,
}

impl StoreWorkspaceTrust {
    pub fn new(store: EventStore) -> Self {
        Self { store }
    }
}

#[async_trait::async_trait]
impl WorkspaceTrust for StoreWorkspaceTrust {
    async fn grant(&self, row: TrustRow) -> Result<(), ApiError> {
        self.store
            .upsert_trust(row)
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))
    }

    async fn trust(&self, id: &WorkspaceId) -> Result<Option<TrustRow>, ApiError> {
        self.store
            .trust(id.as_str())
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))
    }

    async fn revoke(&self, id: &WorkspaceId) -> Result<(), ApiError> {
        self.store
            .delete_trust(id.as_str())
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;
        Ok(())
    }

    async fn list(&self) -> Result<Vec<TrustRow>, ApiError> {
        self.store
            .list_trust()
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))
    }
}

/// In-memory trust port for isolated functional tests.
#[derive(Default, Clone)]
pub struct StaticTrust {
    rows: Arc<RwLock<HashMap<String, TrustRow>>>,
}

impl StaticTrust {
    pub fn new() -> Self {
        Self::default()
    }

    /// Grants trust with `local`-host defaults and the current timestamp.
    pub fn insert(&self, row: TrustRow) {
        self.rows.write().insert(row.workspace_id.clone(), row);
    }

    pub fn with(self, row: TrustRow) -> Self {
        self.insert(row);
        self
    }
}

#[async_trait::async_trait]
impl WorkspaceTrust for StaticTrust {
    async fn grant(&self, row: TrustRow) -> Result<(), ApiError> {
        self.insert(row);
        Ok(())
    }

    async fn trust(&self, id: &WorkspaceId) -> Result<Option<TrustRow>, ApiError> {
        Ok(self.rows.read().get(id.as_str()).cloned())
    }

    async fn revoke(&self, id: &WorkspaceId) -> Result<(), ApiError> {
        self.rows.write().remove(id.as_str());
        Ok(())
    }

    async fn list(&self) -> Result<Vec<TrustRow>, ApiError> {
        let mut rows: Vec<TrustRow> = self.rows.read().values().cloned().collect();
        rows.sort_by(|a, b| b.trusted_at.cmp(&a.trusted_at).then(a.workspace_id.cmp(&b.workspace_id)));
        Ok(rows)
    }
}
