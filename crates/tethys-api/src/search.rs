//! `search.*` namespace (`architecture.md` §12.1).

use tethys_schema::sync::WorkspaceId;
use tethys_schema::SearchItem;

use crate::ApiError;

/// Workspace file search.
pub trait SearchApi: Send + Sync {
    fn search_files(
        &self,
        workspace_id: WorkspaceId,
        query: String,
        limit: usize,
    ) -> impl std::future::Future<Output = Result<Vec<SearchItem>, ApiError>> + Send;
}
