//! Service trait + method routing (transport-agnostic).
//!
//! Module: `tethys-api` — the seam between hosts (`tethys-desktop`,
//! future `tethysd`) and the orchestrator (`tethys-core`).
//! Hosts are thin adapters: they forward Tauri IPC / JSON-RPC calls here.
//! Method names mirror `architecture.md §12.1` (`host.info`, `host.health`).

use tethys_schema::{DiffHunk, HealthStatus, HostInfo, SearchItem};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("internal: {0}")]
    Internal(String),
}

/// Transport-independent core interface. Every host calls this trait;
/// only `tethys-core` implements it.
pub trait TethysApi: Send + Sync {
    fn host_info(&self) -> impl std::future::Future<Output = Result<HostInfo, ApiError>> + Send;
    fn health(&self) -> impl std::future::Future<Output = Result<HealthStatus, ApiError>> + Send;
    fn search_files(
        &self,
        query: String,
        limit: usize,
    ) -> impl std::future::Future<Output = Result<Vec<SearchItem>, ApiError>> + Send;
    fn generate_synthetic_diff(
        &self,
        line_count: usize,
    ) -> impl std::future::Future<Output = Result<Vec<DiffHunk>, ApiError>> + Send;
}
