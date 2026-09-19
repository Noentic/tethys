//! Per-worktree search index lifecycle.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use tethys_schema::SearchItem;

use crate::error::SearchError;
use crate::WorktreeSearchIndex;

/// Longest a query waits for a cold index before reporting `IndexWarming`.
///
/// S0.5 measured 18.5 ms average warm queries on 200k files, so a warm index
/// never reaches this deadline. It bounds the command path: the old
/// constructor blocked for up to 30 s.
pub const WARM_DEADLINE: Duration = Duration::from_millis(150);

/// Owns one lazily opened [`WorktreeSearchIndex`] per worktree root.
#[derive(Default)]
pub struct SearchIndexManager {
    indexes: Mutex<HashMap<PathBuf, Arc<WorktreeSearchIndex>>>,
}

impl SearchIndexManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns the index for `root`, opening it on first use.
    pub fn get_or_open(&self, root: &Path) -> Result<Arc<WorktreeSearchIndex>, SearchError> {
        let key = canonical_root(root)?;
        let mut indexes = self.indexes.lock();
        if let Some(index) = indexes.get(&key) {
            return Ok(Arc::clone(index));
        }
        let index = Arc::new(WorktreeSearchIndex::open(&key)?);
        indexes.insert(key, Arc::clone(&index));
        Ok(index)
    }

    /// Waits up to `deadline` for `root`'s initial scan. Returns `false` on timeout.
    pub fn wait_ready(&self, root: &Path, deadline: Duration) -> Result<bool, SearchError> {
        Ok(self.get_or_open(root)?.wait_ready(deadline))
    }

    /// Queries `root`, waiting the bounded [`WARM_DEADLINE`] on a cold index.
    pub fn query(
        &self,
        root: &Path,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchItem>, SearchError> {
        let index = self.get_or_open(root)?;
        if !index.wait_ready(WARM_DEADLINE) {
            return Err(SearchError::IndexWarming {
                path: root.to_path_buf(),
            });
        }
        index.query(query, limit)
    }

    /// Asks FFF to rescan `root` from disk. No-op when the root is not indexed.
    pub fn invalidate(&self, root: &Path) -> Result<(), SearchError> {
        let key = canonical_root(root)?;
        let index = self.indexes.lock().get(&key).cloned();
        match index {
            Some(index) => index.invalidate(),
            None => Ok(()),
        }
    }

    /// Drops the cached index for `root`; the next access rebuilds it.
    pub fn drop_index(&self, root: &Path) {
        if let Ok(key) = canonical_root(root) {
            self.indexes.lock().remove(&key);
        }
    }
}

fn canonical_root(root: &Path) -> Result<PathBuf, SearchError> {
    root.canonicalize().map_err(|source| SearchError::Io {
        path: root.to_path_buf(),
        source,
    })
}
