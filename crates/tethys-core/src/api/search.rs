//! `search.*` implementations.

use tethys_api::{ApiError, SearchApi};
use tethys_schema::sync::WorkspaceId;
use tethys_schema::SearchItem;

use crate::{map_search_error, Core};

impl SearchApi for Core {
    async fn search_files(
        &self,
        workspace_id: WorkspaceId,
        query: String,
        limit: usize,
    ) -> Result<Vec<SearchItem>, ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        self.search
            .query(&root, &query, limit)
            .map_err(map_search_error)
    }
}
