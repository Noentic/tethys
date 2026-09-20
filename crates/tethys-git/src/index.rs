//! Staging, unstaging, and hunk-level discard (WT-05).
//!
//! Discard only accepts live anchors (`HEAD` ↔ index, index ↔ worktree) and
//! reverse-applies a generated patch after a `--check` dry run.

use std::collections::HashMap;
use std::io::Write;
use std::process::Stdio;

use tethys_schema::{DiffFileStatus, DiffSource, HunkRef};

use crate::diff::{self, LoadedFile};
use crate::error::{GitError, GitResult};
use crate::hunks::{self, DiffCache};
use crate::repo::GitRepo;

/// Stages the given paths.
pub fn stage(repo: &GitRepo, paths: &[String]) -> GitResult<()> {
    run_paths(repo, &["add", "--"], paths)
}

/// Unstages the given paths.
pub fn unstage(repo: &GitRepo, paths: &[String]) -> GitResult<()> {
    run_paths(repo, &["restore", "--staged", "--"], paths)
}

/// Discards either selected hunks or every change in the source anchor.
pub fn discard(
    repo: &GitRepo,
    source: &DiffSource,
    hunks: Option<&[HunkRef]>,
    cache: &mut DiffCache,
    skip_bytes: u64,
) -> GitResult<()> {
    let cached = match source {
        DiffSource::HeadIndex { .. } => true,
        DiffSource::IndexWorktree { .. } => false,
        _ => {
            return Err(GitError::InvalidArgument(
                "discard requires a HEAD/index or index/worktree source".to_string(),
            ))
        }
    };
    let resolved = diff::resolve(repo, source, skip_bytes)?;

    match hunks {
        Some(hunks) => {
            let mut by_path: HashMap<String, Vec<u32>> = HashMap::new();
            for hunk in hunks {
                by_path
                    .entry(hunk.path.clone())
                    .or_default()
                    .push(hunk.hunk_index);
            }
            for (path, indices) in by_path {
                discard_hunks(repo, &resolved, &path, &indices, cached, cache)?;
            }
            Ok(())
        }
        None => {
            let summary = diff::summary(repo, source, skip_bytes)?;
            let paths: Vec<String> = summary
                .files
                .into_iter()
                .filter(|file| cached || file.status != DiffFileStatus::Added)
                .map(|file| file.path)
                .collect();
            if paths.is_empty() {
                return Ok(());
            }
            if cached {
                run_paths(repo, &["restore", "--staged", "--"], &paths)
            } else {
                run_paths(repo, &["checkout-index", "-f", "--"], &paths)
            }
        }
    }
}

fn discard_hunks(
    repo: &GitRepo,
    resolved: &diff::ResolvedDiff,
    path: &str,
    indices: &[u32],
    cached: bool,
    cache: &mut DiffCache,
) -> GitResult<()> {
    let loaded = diff::load_file(repo, resolved, path, cache)?;
    let LoadedFile::Text(context) = loaded else {
        return Err(GitError::PatchFailed(format!(
            "cannot discard hunks of non-text file: {path}"
        )));
    };
    let mut selected = Vec::new();
    for index in indices {
        let hunk = context.hunks.get(*index as usize).ok_or_else(|| {
            GitError::PatchFailed(format!("hunk {index} out of range for {path}"))
        })?;
        selected.push(hunk);
    }
    let old: Vec<&str> = context.old_tokens.iter().map(String::as_str).collect();
    let new: Vec<&str> = context.new_tokens.iter().map(String::as_str).collect();
    let status = context.entry.status;
    let patch = hunks::render_patch(
        path,
        status,
        &context.entry.old_mode,
        &context.entry.new_mode,
        &old,
        &new,
        &selected,
    );
    if !matches!(
        status,
        DiffFileStatus::Added | DiffFileStatus::Deleted | DiffFileStatus::Modified
    ) {
        return Err(GitError::PatchFailed(format!(
            "cannot discard {status:?} file: {path}"
        )));
    }
    apply_reverse(repo, &patch, cached)
}

fn apply_reverse(repo: &GitRepo, patch: &str, cached: bool) -> GitResult<()> {
    let mut check = vec!["apply", "-R", "--check"];
    if cached {
        check.push("--cached");
    }
    run_patch(repo, &check, patch)?;
    let mut apply = vec!["apply", "-R"];
    if cached {
        apply.push("--cached");
    }
    run_patch(repo, &apply, patch)
}

fn run_patch(repo: &GitRepo, args: &[&str], patch: &str) -> GitResult<()> {
    let mut child = repo
        .command()
        .env("GIT_LITERAL_PATHSPECS", "1")
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(patch.as_bytes())?;
    }
    let output = child.wait_with_output()?;
    if !output.status.success() {
        return Err(GitError::PatchFailed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

fn run_paths(repo: &GitRepo, prefix: &[&str], paths: &[String]) -> GitResult<()> {
    if paths.is_empty() {
        return Err(GitError::InvalidArgument("no paths given".to_string()));
    }
    let mut args: Vec<&str> = prefix.to_vec();
    args.extend(paths.iter().map(String::as_str));
    let output = repo
        .command()
        .env("GIT_LITERAL_PATHSPECS", "1")
        .args(&args)
        .output()?;
    if !output.status.success() {
        return Err(GitError::command(&args, &output));
    }
    Ok(())
}
