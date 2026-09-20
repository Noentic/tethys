//! Workspace root resolution (`WorkspaceRoots` port, F1/F7, D10).
//!
//! The webview never names a path; every API method identifies the workspace by
//! `WorkspaceId`. Core resolves the root through `WorkspaceRoots` and returns
//! `ApiError::NotFound` for unknown, untrusted, or revoked workspaces.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::RwLock;
use tethys_api::ApiError;
use tethys_schema::catalog::WorkspaceTrustState;
use tethys_schema::sync::WorkspaceId;
use tethys_store::EventStore;

use crate::workspace_trust::WorkspaceTrust;

/// Resolves a workspace ID to its on-disk filesystem root.
#[async_trait::async_trait]
pub trait WorkspaceRoots: Send + Sync {
    async fn root(&self, id: &WorkspaceId) -> Result<PathBuf, ApiError>;
}

/// Store-backed workspace root resolver (reads from SQLite `workspaces` table).
pub struct StoreWorkspaceRoots {
    store: EventStore,
}

impl StoreWorkspaceRoots {
    pub fn new(store: EventStore) -> Self {
        Self { store }
    }
}

#[async_trait::async_trait]
impl WorkspaceRoots for StoreWorkspaceRoots {
    async fn root(&self, id: &WorkspaceId) -> Result<PathBuf, ApiError> {
        let row = self
            .store
            .workspace(id.as_str())
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?;
        match row {
            Some(w) => Ok(PathBuf::from(w.root_path)),
            None => Err(ApiError::NotFound(format!(
                "workspace not found: {}",
                id.as_str()
            ))),
        }
    }
}

/// In-memory workspace roots resolver for isolated functional tests.
#[derive(Default, Clone)]
pub struct StaticWorkspaces {
    roots: Arc<RwLock<HashMap<String, PathBuf>>>,
}

impl StaticWorkspaces {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&self, id: impl Into<String>, path: impl Into<PathBuf>) {
        self.roots.write().insert(id.into(), path.into());
    }

    pub fn with(self, id: impl Into<String>, path: impl Into<PathBuf>) -> Self {
        self.insert(id, path);
        self
    }
}

#[async_trait::async_trait]
impl WorkspaceRoots for StaticWorkspaces {
    async fn root(&self, id: &WorkspaceId) -> Result<PathBuf, ApiError> {
        let map = self.roots.read();
        match map.get(id.as_str()) {
            Some(p) => Ok(p.clone()),
            None => Err(ApiError::NotFound(format!(
                "workspace not found: {}",
                id.as_str()
            ))),
        }
    }
}

/// The single trust gate: resolves the inner root, then requires a live trust
/// row whose resolved path and remote still match the folder.
///
/// Every filesystem namespace already resolves through this one port (M1.4),
/// so an untrusted, revoked, or changed workspace resolves to `NotFound` for
/// all of them without a per-namespace edit.
pub struct TrustFilteredRoots {
    inner: Arc<dyn WorkspaceRoots>,
    trust: Arc<dyn WorkspaceTrust>,
}

impl TrustFilteredRoots {
    pub fn new(inner: Arc<dyn WorkspaceRoots>, trust: Arc<dyn WorkspaceTrust>) -> Self {
        Self { inner, trust }
    }

    /// Why a workspace is or is not currently admitted, for the catalog's
    /// absent-card reasoning (never added vs revoked vs changed).
    pub async fn trust_status(&self, id: &WorkspaceId) -> WorkspaceTrustState {
        let Ok(root) = self.inner.root(id).await else {
            return WorkspaceTrustState::Untrusted;
        };
        let record = self.trust.trust(id).await.ok().flatten();
        crate::workspace_trust::trust_state_async(record, root).await
    }
}

#[async_trait::async_trait]
impl WorkspaceRoots for TrustFilteredRoots {
    async fn root(&self, id: &WorkspaceId) -> Result<PathBuf, ApiError> {
        let path = self.inner.root(id).await?;
        let record = self
            .trust
            .trust(id)
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;
        if crate::workspace_trust::trust_state_async(record, path.clone()).await
            == WorkspaceTrustState::Trusted
        {
            Ok(path)
        } else {
            Err(not_found(id))
        }
    }
}

fn not_found(id: &WorkspaceId) -> ApiError {
    ApiError::NotFound(format!("workspace not found: {}", id.as_str()))
}
