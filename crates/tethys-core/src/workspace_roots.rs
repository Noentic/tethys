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
use tethys_schema::sync::WorkspaceId;
use tethys_store::EventStore;

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
