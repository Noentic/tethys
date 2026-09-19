//! Per-worktree fuzzy file and folder search over FFF.

mod error;
mod manager;

pub use error::SearchError;
pub use manager::{SearchIndexManager, WARM_DEADLINE};

use std::path::{Path, PathBuf};
use std::time::Duration;

use fff_search::file_picker::{FilePicker, FilePickerOptions};
use fff_search::shared::{SharedFilePicker, SharedFrecency};
use fff_search::{FFFMode, FuzzySearchOptions, MixedItemRef, PaginationArgs, QueryParser};
use tethys_schema::SearchItem;

/// A single worktree's FFF-backed search index.
///
/// Construction spawns FFF's background scan and returns immediately; call
/// [`WorktreeSearchIndex::wait_ready`] before expecting complete results.
pub struct WorktreeSearchIndex {
    base_path: PathBuf,
    picker: SharedFilePicker,
    frecency: SharedFrecency,
}

impl WorktreeSearchIndex {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, SearchError> {
        let base_path = path.as_ref().to_path_buf();
        let picker = SharedFilePicker::default();
        let frecency = SharedFrecency::default();

        let options = FilePickerOptions {
            base_path: base_path.to_string_lossy().to_string(),
            mode: FFFMode::Ai,
            enable_fs_root_scanning: false,
            enable_home_dir_scanning: true,
            ..Default::default()
        };

        FilePicker::new_with_shared_state(picker.clone(), frecency.clone(), options)
            .map_err(|e| SearchError::Picker(e.to_string()))?;

        Ok(Self {
            base_path,
            picker,
            frecency,
        })
    }

    /// Waits up to `deadline` for the initial scan. Returns `false` on timeout.
    pub fn wait_ready(&self, deadline: Duration) -> bool {
        self.picker.wait_for_scan(deadline)
    }

    /// Queries files **and** folders, interleaved by FFF score.
    pub fn query(&self, query_str: &str, limit: usize) -> Result<Vec<SearchItem>, SearchError> {
        let picker_guard = self
            .picker
            .read()
            .map_err(|e| SearchError::Picker(e.to_string()))?;
        let picker = picker_guard
            .as_ref()
            .ok_or_else(|| SearchError::Picker("picker not initialized".to_string()))?;

        let parser = QueryParser::default();
        let query = parser.parse(query_str);

        let search_opts = FuzzySearchOptions {
            max_threads: 0,
            current_file: None,
            pagination: PaginationArgs {
                offset: 0,
                limit: limit.max(1),
            },
            ..Default::default()
        };

        let results = picker.fuzzy_search_mixed(&query, None, search_opts);

        let items = results
            .items
            .into_iter()
            .zip(results.scores)
            .map(|(item, score)| {
                let (relative_path, is_dir) = match item {
                    MixedItemRef::File(file) => (file.relative_path(picker), false),
                    MixedItemRef::Dir(dir) => (dir.relative_path(picker), true),
                };
                SearchItem {
                    relative_path,
                    score: score.total,
                    is_dir,
                }
            })
            .collect();

        Ok(items)
    }

    /// Triggers a full background rescan of this worktree.
    pub fn invalidate(&self) -> Result<(), SearchError> {
        self.picker
            .trigger_full_rescan_async(&self.frecency)
            .map_err(|e| SearchError::Picker(e.to_string()))
    }

    pub fn base_path(&self) -> &Path {
        &self.base_path
    }
}
