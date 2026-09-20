//! Shared filesystem walk for skill folders.

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::SyncError;

/// Collects `(relative path, absolute path)` for every file under `dir`.
///
/// A missing or unreadable `dir` is an error; callers that tolerate absence
/// check first.
pub fn files(root: &Path, dir: &Path) -> Result<Vec<(PathBuf, PathBuf)>, SyncError> {
    let mut found = Vec::new();
    collect(root, dir, &mut found)?;
    found.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(found)
}

fn collect(root: &Path, dir: &Path, files: &mut Vec<(PathBuf, PathBuf)>) -> Result<(), SyncError> {
    let Ok(read_dir) = fs::read_dir(dir) else {
        return Ok(());
    };
    for entry in read_dir {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            collect(root, &path, files)?;
        } else if file_type.is_file() {
            let relative = path.strip_prefix(root).unwrap_or(&path).to_path_buf();
            files.push((relative, path));
        }
    }
    Ok(())
}
