//! Orchestrator and domain core (implements `tethys-api`).

pub mod synthetic;

use parking_lot::RwLock;
use std::sync::Arc;
use tethys_api::{ApiError, TethysApi};
use tethys_schema::{DiffHunk, HealthStatus, HostInfo, SearchItem};
use tethys_search::WorktreeSearchIndex;

#[derive(Default)]
pub struct Core {
    version: String,
    search_index: Arc<RwLock<Option<WorktreeSearchIndex>>>,
}

impl Core {
    pub fn new(version: impl Into<String>) -> Self {
        Self {
            version: version.into(),
            search_index: Arc::new(RwLock::new(None)),
        }
    }

    pub fn set_search_index(&self, index: WorktreeSearchIndex) {
        *self.search_index.write() = Some(index);
    }
}

impl TethysApi for Core {
    async fn host_info(&self) -> Result<HostInfo, ApiError> {
        Ok(HostInfo {
            version: self.version.clone(),
            platform: std::env::consts::OS.to_string(),
        })
    }

    async fn health(&self) -> Result<HealthStatus, ApiError> {
        Ok(HealthStatus {
            ok: true,
            core_version: self.version.clone(),
        })
    }

    async fn search_files(&self, query: String, limit: usize) -> Result<Vec<SearchItem>, ApiError> {
        let guard = self.search_index.read();
        let index = guard
            .as_ref()
            .ok_or_else(|| ApiError::Internal("Search index not initialized".to_string()))?;

        index
            .query(&query, limit)
            .map_err(ApiError::Internal)
    }

    async fn generate_synthetic_diff(&self, line_count: usize) -> Result<Vec<DiffHunk>, ApiError> {
        Ok(synthetic::generate_synthetic_diff(line_count))
    }
}
