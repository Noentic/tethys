//! CLI read layer (`architecture.md` AD-5 fallback, recorded in the plan).
//!
//! All reads go through git itself; a future gix port swaps this module only.

use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::process::Stdio;

use crate::error::{GitError, GitResult};
use crate::repo::{GitRepo, EMPTY_TREE};

/// One parsed `git status --porcelain=v2` record.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusEntry {
    pub path: String,
    pub untracked: bool,
    pub staged: bool,
    pub worktree_changed: bool,
}

impl StatusEntry {
    /// True when the path represents state not captured by HEAD.
    pub fn is_uncommitted(&self) -> bool {
        self.untracked || self.staged || self.worktree_changed
    }
}

/// Lists every changed path (untracked included, ignored excluded).
pub fn status_entries(repo: &GitRepo) -> GitResult<Vec<StatusEntry>> {
    let out = repo.git(&["status", "--porcelain=v2", "-z", "-uall", "--no-renames"])?;
    Ok(parse_porcelain_v2(&out))
}

/// Paths that would be lost if the worktree were removed.
pub fn uncommitted_paths(repo: &GitRepo) -> GitResult<Vec<String>> {
    Ok(status_entries(repo)?
        .into_iter()
        .filter(StatusEntry::is_uncommitted)
        .map(|entry| entry.path)
        .collect())
}

/// Tree of HEAD, or git's empty tree on an unborn branch.
pub fn head_tree(repo: &GitRepo) -> GitResult<String> {
    Ok(repo
        .rev_parse("HEAD^{tree}")?
        .unwrap_or_else(|| EMPTY_TREE.to_string()))
}

/// Tree of the real index.
pub fn index_tree(repo: &GitRepo) -> GitResult<String> {
    repo.git_str(&["write-tree"])
}

/// Tree of an arbitrary commit-ish.
pub fn rev_tree(repo: &GitRepo, rev: &str) -> GitResult<Option<String>> {
    repo.rev_parse(&format!("{rev}^{{tree}}"))
}

/// Raw blob content.
pub fn blob(repo: &GitRepo, oid: &str) -> GitResult<Vec<u8>> {
    repo.git(&["cat-file", "blob", oid])
}

/// Blob sizes for a batch of object ids (missing ids are omitted).
pub fn blob_sizes(repo: &GitRepo, oids: &[String]) -> GitResult<HashMap<String, u64>> {
    if oids.is_empty() {
        return Ok(HashMap::new());
    }
    let mut input = String::new();
    for oid in oids {
        input.push_str(oid);
        input.push('\n');
    }
    let output = run_with_stdin(
        repo,
        &["cat-file", "--batch-check=%(objectname) %(objectsize)"],
        input.as_bytes(),
    )?;
    let mut sizes = HashMap::new();
    for line in String::from_utf8_lossy(&output).lines() {
        let mut parts = line.split(' ');
        if let (Some(oid), Some(size)) = (parts.next(), parts.next()) {
            if let Ok(size) = size.parse::<u64>() {
                sizes.insert(oid.to_string(), size);
            }
        }
    }
    Ok(sizes)
}

/// Root of the main worktree for `repo` (bootstrap source).
pub fn main_worktree_root(repo: &GitRepo) -> GitResult<PathBuf> {
    let out = repo.git_str(&["worktree", "list", "--porcelain"])?;
    for line in out.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            let root = PathBuf::from(path);
            if root.is_dir() {
                return Ok(root);
            }
        }
    }
    Ok(repo.worktree_root.clone())
}

/// Reads a remote's fetch URL without fetching anything (`git remote get-url`).
///
/// A missing remote is `None`, not an error: a local-only repository has no
/// origin and the capability resolver must read that as `GitLocal`.
pub fn remote_url(repo: &GitRepo, remote: &str) -> GitResult<Option<String>> {
    let output = repo
        .command()
        .args(["remote", "get-url", remote])
        .output()?;
    if !output.status.success() {
        return Ok(None);
    }
    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!url.is_empty()).then_some(url))
}

/// Commits on `HEAD` that have not reached its upstream (empty without one).
pub fn unpushed_commits(repo: &GitRepo) -> GitResult<Vec<String>> {
    if repo.rev_parse("@{u}")?.is_none() {
        return Ok(Vec::new());
    }
    let out = repo.git_str(&["rev-list", "@{u}..HEAD"])?;
    Ok(out
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

fn parse_porcelain_v2(raw: &[u8]) -> Vec<StatusEntry> {
    let mut entries = Vec::new();
    for chunk in raw.split(|byte| *byte == 0) {
        if chunk.is_empty() {
            continue;
        }
        let text = String::from_utf8_lossy(chunk);
        match chunk[0] {
            b'1' => {
                if let Some(rest) = split_nth(&text, 9) {
                    let xy = text.split(' ').nth(1).unwrap_or("..");
                    entries.push(StatusEntry {
                        path: rest,
                        untracked: false,
                        staged: xy.as_bytes().first().is_some_and(|b| *b != b'.'),
                        worktree_changed: xy.as_bytes().get(1).is_some_and(|b| *b != b'.'),
                    });
                }
            }
            b'u' => {
                if let Some(rest) = split_nth(&text, 11) {
                    entries.push(StatusEntry {
                        path: rest,
                        untracked: false,
                        staged: true,
                        worktree_changed: true,
                    });
                }
            }
            b'?' => {
                if let Some(rest) = split_nth(&text, 2) {
                    entries.push(StatusEntry {
                        path: rest,
                        untracked: true,
                        staged: false,
                        worktree_changed: true,
                    });
                }
            }
            _ => {}
        }
    }
    entries
}

/// Returns everything after the first `fields - 1` space-separated fields.
fn split_nth(text: &str, fields: usize) -> Option<String> {
    let mut iter = text.splitn(fields, ' ');
    for _ in 1..fields {
        iter.next()?;
    }
    iter.next().map(str::to_string)
}

fn run_with_stdin(repo: &GitRepo, args: &[&str], input: &[u8]) -> GitResult<Vec<u8>> {
    let mut child = repo
        .command()
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(input)?;
    }
    let output = child.wait_with_output()?;
    if !output.status.success() {
        return Err(GitError::command(args, &output));
    }
    Ok(output.stdout)
}
