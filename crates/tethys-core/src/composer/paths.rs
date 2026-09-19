//! `@path` reference resolution (CMP-04).
//!
//! Completion is `search.files`; this module turns a chosen token into the
//! plaintext `@<relative-path>` prompt text plus UI metadata. File contents are
//! never read. Line ranges (`@file.rs:40-80`) are deferred (CMP-06).

use std::path::Path;

use tethys_schema::composer::{ComposerReference, ReferenceKind};

/// Resolves a worktree-relative token into `@relative-path` plus its metadata.
///
/// Returns `None` when the token escapes the root, is empty, or does not exist;
/// the caller then leaves the token as literal text.
pub fn path_reference(root: &Path, token: &str) -> Option<(String, ComposerReference)> {
    let token = token.trim_start_matches('/');
    if token.is_empty() {
        return None;
    }

    let root = root.canonicalize().ok()?;
    let absolute = root.join(token).canonicalize().ok()?;
    if !absolute.starts_with(&root) {
        return None;
    }

    let metadata = std::fs::metadata(&absolute).ok()?;
    let is_dir = metadata.is_dir();
    let name = absolute.file_name()?.to_string_lossy().into_owned();
    let relative = absolute
        .strip_prefix(&root)
        .ok()?
        .to_string_lossy()
        .replace('\\', "/");

    let (mime, size) = if is_dir {
        (None, None)
    } else {
        (
            mime_guess::from_path(&absolute)
                .first()
                .map(|mime| mime.essence_str().to_string()),
            Some(metadata.len() as f64),
        )
    };

    let reference = ComposerReference {
        kind: ReferenceKind::Path,
        name,
        path: relative.clone(),
        is_dir,
        mime,
        size,
    };

    Some((format!("@{relative}"), reference))
}
