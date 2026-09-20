//! Copies configured untracked files (default `.env*`) into a new worktree.
//!
//! Globs match whole path segments: `*` and `?` never cross `/`, while `**`
//! matches any number of segments. Existing files are never overwritten.

use std::path::Path;

use crate::error::{GitError, GitResult};

/// Copies files matching `globs` from `source_root` into `dest_root`.
///
/// Returns the relative paths copied, for logging and tests.
pub(crate) fn copy(
    source_root: &Path,
    dest_root: &Path,
    globs: &[String],
) -> GitResult<Vec<String>> {
    if globs.is_empty() {
        return Ok(Vec::new());
    }
    // Only descend as deep as the deepest glob can match; patterns without
    // `**` never cross their segment count, so a `.env*` glob never walks a
    // `node_modules` tree.
    let max_depth = if globs.iter().any(|glob| glob.contains("**")) {
        usize::MAX
    } else {
        globs
            .iter()
            .map(|glob| glob.split('/').count())
            .max()
            .unwrap_or(1)
    };

    let mut copied = Vec::new();
    for relative in walk(source_root, source_root, 0, max_depth)? {
        if !globs.iter().any(|glob| pattern_matches(glob, &relative)) {
            continue;
        }
        let source = source_root.join(&relative);
        let destination = dest_root.join(&relative);
        if destination.exists() {
            continue;
        }
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(&source, &destination)?;
        copied.push(relative);
    }
    Ok(copied)
}

fn walk(root: &Path, dir: &Path, depth: usize, max_depth: usize) -> GitResult<Vec<String>> {
    if depth > 32 {
        return Err(GitError::InvalidPath(format!(
            "bootstrap glob walk exceeded depth at {}",
            dir.display()
        )));
    }
    let mut found = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name == ".git" {
            continue;
        }
        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .map_err(|_| GitError::InvalidPath(path.display().to_string()))?
            .to_string_lossy()
            .replace('\\', "/");
        if file_type.is_dir() {
            if depth + 1 < max_depth {
                found.extend(walk(root, &path, depth + 1, max_depth)?);
            }
        } else if file_type.is_file() {
            found.push(relative);
        }
    }
    Ok(found)
}

/// Matches an entire relative path against a glob.
pub(crate) fn pattern_matches(pattern: &str, path: &str) -> bool {
    let pattern_segments: Vec<&str> = pattern.split('/').collect();
    let path_segments: Vec<&str> = path.split('/').collect();
    match_segments(&pattern_segments, &path_segments)
}

fn match_segments(pattern: &[&str], path: &[&str]) -> bool {
    match pattern.first() {
        None => path.is_empty(),
        Some(&"**") => (0..=path.len()).any(|skip| match_segments(&pattern[1..], &path[skip..])),
        Some(segment) => {
            !path.is_empty()
                && segment_matches(segment, path[0])
                && match_segments(&pattern[1..], &path[1..])
        }
    }
}

fn segment_matches(pattern: &str, text: &str) -> bool {
    let pattern: Vec<char> = pattern.chars().collect();
    let text: Vec<char> = text.chars().collect();
    let (mut pi, mut ti) = (0usize, 0usize);
    let mut star: Option<usize> = None;
    let mut resume = 0usize;
    while ti < text.len() {
        if pi < pattern.len() && (pattern[pi] == '?' || pattern[pi] == text[ti]) {
            pi += 1;
            ti += 1;
        } else if pi < pattern.len() && pattern[pi] == '*' {
            star = Some(pi);
            resume = ti;
            pi += 1;
        } else if let Some(star_at) = star {
            pi = star_at + 1;
            resume += 1;
            ti = resume;
        } else {
            return false;
        }
    }
    while pi < pattern.len() && pattern[pi] == '*' {
        pi += 1;
    }
    pi == pattern.len()
}
