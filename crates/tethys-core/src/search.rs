use std::path::{Path, PathBuf};
use std::time::Duration;
use fff_search::file_picker::{FilePicker, FilePickerOptions};
use fff_search::shared::SharedFilePicker;
use fff_search::{FFFMode, FuzzySearchOptions, PaginationArgs, QueryParser};
use tethys_schema::SearchItem;

pub struct WorktreeSearchIndex {
    base_path: PathBuf,
    picker: SharedFilePicker,
}

impl WorktreeSearchIndex {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let base_path = path.as_ref().to_path_buf();
        let picker = SharedFilePicker::default();

        let options = FilePickerOptions {
            base_path: base_path.to_string_lossy().to_string(),
            mode: FFFMode::Ai,
            enable_fs_root_scanning: false,
            enable_home_dir_scanning: true,
            ..Default::default()
        };

        FilePicker::new_with_shared_state(
            picker.clone(),
            Default::default(),
            options,
        ).map_err(|e| format!("failed to initialize file picker: {e}"))?;

        // Wait up to 5s for initial scan
        picker.wait_for_scan(Duration::from_secs(5));

        Ok(Self { base_path, picker })
    }

    pub fn query(&self, query_str: &str, limit: usize) -> Result<Vec<SearchItem>, String> {
        let picker_guard = self.picker.read().map_err(|e| format!("lock error: {e}"))?;
        let picker = picker_guard.as_ref().ok_or_else(|| "picker not initialized".to_string())?;

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

        let results = picker.fuzzy_search(&query, None, search_opts);

        let items = results
            .items
            .into_iter()
            .zip(results.scores.into_iter())
            .map(|(item, score)| {
                let rel = item.relative_path(picker);
                SearchItem {
                    relative_path: rel.to_string(),
                    score: score.total,
                }
            })
            .collect();

        Ok(items)
    }

    pub fn base_path(&self) -> &Path {
        &self.base_path
    }
}
