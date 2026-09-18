//! Search wire types (`search.files`).

use serde::{Deserialize, Serialize};
use specta::Type;

/// A search item result returned by FFF search (`search.files`).
///
/// `relative_path` is relative to the queried worktree root. `is_dir`
/// distinguishes folders from files so `@` chips can render folder icons.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct SearchItem {
    pub relative_path: String,
    pub score: i32,
    pub is_dir: bool,
}
