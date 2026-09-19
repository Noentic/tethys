//! Anchor-based diff engine (`architecture.md` §10.1).
//!
//! `DiffSource` names the two trees to compare; live worktree states are
//! snapshotted through temporary indexes so the real index is never touched.

use std::collections::{HashMap, HashSet};

use tethys_schema::{
    CheckpointPhase, DiffFile, DiffFileDetail, DiffFileStatus, DiffSource, DiffSummary,
};

use crate::checkpoint;
use crate::error::{GitError, GitResult};
use crate::hunks::{self, ComputedHunk, DiffCache};
use crate::read;
use crate::repo::GitRepo;

pub(crate) const COLLAPSE_BYTES: u64 = 1024 * 1024;
pub(crate) const COLLAPSE_LINES: u32 = 20_000;
const ZERO_OID: &str = "0000000000000000000000000000000000000000";

/// Trees a diff runs between, before any path filtering.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ResolvedDiff {
    pub source: DiffSource,
    pub old_tree: String,
    pub new_tree: String,
}

/// One raw `diff-tree` record.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FileEntry {
    pub path: String,
    pub old_oid: String,
    pub new_oid: String,
    pub old_mode: String,
    pub new_mode: String,
    pub status: DiffFileStatus,
}

/// A text file prepared for rendering or patch generation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FilePatchContext {
    pub entry: FileEntry,
    pub old_tokens: Vec<String>,
    pub new_tokens: Vec<String>,
    pub hunks: Vec<ComputedHunk>,
}

/// Result of loading one file for diffing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum LoadedFile {
    Absent,
    Binary {
        entry: FileEntry,
        additions: u32,
        deletions: u32,
    },
    Collapsed {
        entry: FileEntry,
        additions: u32,
        deletions: u32,
    },
    Text(FilePatchContext),
}

/// Turns a `DiffSource` into the two trees it anchors. `TurnStartWorktree`,
/// `BaseWorktree`, and the HEAD/index live states are snapshotted here.
pub(crate) fn resolve(
    repo: &GitRepo,
    source: &DiffSource,
    skip_untracked_binary_bytes: u64,
) -> GitResult<ResolvedDiff> {
    let snapshot = |tag: &str| -> GitResult<String> {
        Ok(checkpoint::snapshot_worktree(repo, tag, skip_untracked_binary_bytes)?.tree)
    };

    let (old_tree, new_tree) = match source {
        DiffSource::BaseLatestEnd { thread_id, base } => {
            let end = checkpoint::latest_end(repo, thread_id)?.ok_or_else(|| {
                GitError::CheckpointNotFound(format!("{thread_id}: no end checkpoint"))
            })?;
            (required_tree(repo, base)?, end.tree_oid)
        }
        DiffSource::BaseWorktree { base, .. } => {
            (required_tree(repo, base)?, snapshot("diff_live")?)
        }
        DiffSource::TurnStartEnd { thread_id, turn } => (
            ref_tree(repo, thread_id, *turn, CheckpointPhase::Start)?,
            ref_tree(repo, thread_id, *turn, CheckpointPhase::End)?,
        ),
        DiffSource::TurnStartWorktree { thread_id, turn } => (
            ref_tree(repo, thread_id, *turn, CheckpointPhase::Start)?,
            snapshot("diff_live")?,
        ),
        DiffSource::HeadIndex { .. } => (read::head_tree(repo)?, read::index_tree(repo)?),
        DiffSource::HeadWorktree { .. } => (read::head_tree(repo)?, snapshot("diff_live")?),
        DiffSource::IndexWorktree { .. } => (read::index_tree(repo)?, snapshot("diff_live")?),
    };

    Ok(ResolvedDiff {
        source: source.clone(),
        old_tree,
        new_tree,
    })
}

fn required_tree(repo: &GitRepo, rev: &str) -> GitResult<String> {
    read::rev_tree(repo, rev)?.ok_or_else(|| GitError::CheckpointNotFound(rev.to_string()))
}

fn ref_tree(
    repo: &GitRepo,
    thread_id: &str,
    turn: u32,
    phase: CheckpointPhase,
) -> GitResult<String> {
    let ref_name = checkpoint::turn_ref(thread_id, turn, phase);
    let commit = repo
        .rev_parse(&ref_name)?
        .ok_or_else(|| GitError::CheckpointNotFound(ref_name.clone()))?;
    read::rev_tree(repo, &commit)?.ok_or(GitError::CheckpointNotFound(ref_name))
}

/// Aggregates a diff for every changed file.
pub fn summary(repo: &GitRepo, source: &DiffSource, skip_bytes: u64) -> GitResult<DiffSummary> {
    let resolved = resolve(repo, source, skip_bytes)?;
    let raw = repo.git(&[
        "diff-tree",
        "-r",
        "-z",
        "--raw",
        "--no-renames",
        &resolved.old_tree,
        &resolved.new_tree,
    ])?;
    let numstat = repo.git(&[
        "diff-tree",
        "-r",
        "-z",
        "--numstat",
        "--no-renames",
        &resolved.old_tree,
        &resolved.new_tree,
    ])?;
    let entries = parse_raw_entries(&raw);
    let counts = parse_numstat(&numstat);

    let mut seen = HashSet::new();
    let oids: Vec<String> = entries
        .iter()
        .flat_map(|entry| [&entry.old_oid, &entry.new_oid])
        .filter(|oid| !is_zero_oid(oid) && seen.insert(oid.as_str()))
        .cloned()
        .collect();
    let sizes = read::blob_sizes(repo, &oids)?;

    let mut files = Vec::with_capacity(entries.len());
    let mut total_additions = 0u32;
    let mut total_deletions = 0u32;
    for entry in entries {
        let (additions, deletions, binary) =
            counts.get(&entry.path).copied().unwrap_or((0, 0, false));
        total_additions += additions;
        total_deletions += deletions;
        let oversized = [&entry.old_oid, &entry.new_oid]
            .iter()
            .filter(|oid| !is_zero_oid(oid))
            .any(|oid| sizes.get(*oid).is_some_and(|size| *size > COLLAPSE_BYTES));
        files.push(DiffFile {
            path: entry.path,
            old_path: None,
            status: entry.status,
            additions,
            deletions,
            binary,
            collapsed: !binary
                && (oversized || additions.saturating_add(deletions) > COLLAPSE_LINES),
        });
    }

    Ok(DiffSummary {
        source: resolved.source,
        files,
        additions: total_additions,
        deletions: total_deletions,
    })
}

/// Full detail for one path.
pub fn file_detail(
    repo: &GitRepo,
    source: &DiffSource,
    path: &str,
    cache: &mut DiffCache,
    skip_bytes: u64,
) -> GitResult<DiffFileDetail> {
    let resolved = resolve(repo, source, skip_bytes)?;
    match load_file(repo, &resolved, path, cache)? {
        LoadedFile::Absent => Ok(empty_detail(path)),
        LoadedFile::Binary {
            additions,
            deletions,
            ..
        } => Ok(DiffFileDetail {
            path: path.to_string(),
            binary: true,
            collapsed: false,
            additions,
            deletions,
            hunks: Vec::new(),
        }),
        LoadedFile::Collapsed {
            additions,
            deletions,
            ..
        } => Ok(DiffFileDetail {
            path: path.to_string(),
            binary: false,
            collapsed: true,
            additions,
            deletions,
            hunks: Vec::new(),
        }),
        LoadedFile::Text(context) => {
            let old = as_refs(&context.old_tokens);
            let new = as_refs(&context.new_tokens);
            let hunks = context
                .hunks
                .iter()
                .map(|hunk| hunks::to_display(hunk, &old, &new))
                .collect();
            let (additions, deletions) = count_changes(&context.hunks);
            Ok(DiffFileDetail {
                path: path.to_string(),
                binary: false,
                collapsed: false,
                additions,
                deletions,
                hunks,
            })
        }
    }
}

/// Loads one path for rendering or patch generation.
pub(crate) fn load_file(
    repo: &GitRepo,
    resolved: &ResolvedDiff,
    path: &str,
    cache: &mut DiffCache,
) -> GitResult<LoadedFile> {
    let Some(entry) = file_entry(repo, resolved, path)? else {
        return Ok(LoadedFile::Absent);
    };
    let (old_bytes, new_bytes) = load_blobs(repo, &entry)?;
    let (additions, deletions) = numstat_for(repo, resolved, path);

    if hunks::looks_binary(&old_bytes) || hunks::looks_binary(&new_bytes) {
        return Ok(LoadedFile::Binary {
            entry,
            additions: 0,
            deletions: 0,
        });
    }
    if old_bytes.len() as u64 > COLLAPSE_BYTES
        || new_bytes.len() as u64 > COLLAPSE_BYTES
        || additions.saturating_add(deletions) > COLLAPSE_LINES
    {
        return Ok(LoadedFile::Collapsed {
            entry,
            additions,
            deletions,
        });
    }

    let old_text = String::from_utf8_lossy(&old_bytes);
    let new_text = String::from_utf8_lossy(&new_bytes);
    let key = DiffCache::key(&entry.old_oid, &entry.new_oid);
    let computed = match cache.get(&key) {
        Some(cached) => cached,
        None => {
            let computed = hunks::compute(&old_text, &new_text);
            cache.insert(key, computed.clone());
            computed
        }
    };
    Ok(LoadedFile::Text(FilePatchContext {
        entry,
        old_tokens: hunks::line_tokens(&old_text)
            .iter()
            .map(|s| s.to_string())
            .collect(),
        new_tokens: hunks::line_tokens(&new_text)
            .iter()
            .map(|s| s.to_string())
            .collect(),
        hunks: computed,
    }))
}

/// Fetches the raw entry for one path, if it changed.
pub(crate) fn file_entry(
    repo: &GitRepo,
    resolved: &ResolvedDiff,
    path: &str,
) -> GitResult<Option<FileEntry>> {
    let raw = repo.git_literal(&[
        "diff-tree",
        "-r",
        "-z",
        "--raw",
        "--no-renames",
        &resolved.old_tree,
        &resolved.new_tree,
        "--",
        path,
    ])?;
    Ok(parse_raw_entries(&raw).into_iter().next())
}

fn load_blobs(repo: &GitRepo, entry: &FileEntry) -> GitResult<(Vec<u8>, Vec<u8>)> {
    let old = if is_zero_oid(&entry.old_oid) {
        Vec::new()
    } else {
        read::blob(repo, &entry.old_oid)?
    };
    let new = if is_zero_oid(&entry.new_oid) {
        Vec::new()
    } else {
        read::blob(repo, &entry.new_oid)?
    };
    Ok((old, new))
}

fn numstat_for(repo: &GitRepo, resolved: &ResolvedDiff, path: &str) -> (u32, u32) {
    let Ok(out) = repo.git_literal(&[
        "diff-tree",
        "-r",
        "-z",
        "--numstat",
        "--no-renames",
        &resolved.old_tree,
        &resolved.new_tree,
        "--",
        path,
    ]) else {
        return (0, 0);
    };
    parse_numstat(&out)
        .get(path)
        .map(|(additions, deletions, _)| (*additions, *deletions))
        .unwrap_or((0, 0))
}

pub(crate) fn is_zero_oid(oid: &str) -> bool {
    oid == ZERO_OID
}

fn as_refs(tokens: &[String]) -> Vec<&str> {
    tokens.iter().map(String::as_str).collect()
}

fn count_changes(hunks: &[ComputedHunk]) -> (u32, u32) {
    let mut additions = 0;
    let mut deletions = 0;
    for hunk in hunks {
        for line in &hunk.plan {
            match line {
                hunks::PlanLine::Add { .. } => additions += 1,
                hunks::PlanLine::Remove { .. } => deletions += 1,
                hunks::PlanLine::Context { .. } => {}
            }
        }
    }
    (additions, deletions)
}

fn empty_detail(path: &str) -> DiffFileDetail {
    DiffFileDetail {
        path: path.to_string(),
        binary: false,
        collapsed: false,
        additions: 0,
        deletions: 0,
        hunks: Vec::new(),
    }
}

pub(crate) fn parse_raw_entries(raw: &[u8]) -> Vec<FileEntry> {
    let mut entries = Vec::new();
    let mut chunks = raw.split(|byte| *byte == 0);
    while let Some(chunk) = chunks.next() {
        if chunk.is_empty() || chunk[0] != b':' {
            continue;
        }
        let text = String::from_utf8_lossy(chunk);
        let meta: Vec<&str> = text[1..].split(' ').collect();
        if meta.len() < 5 {
            continue;
        }
        let path = chunks
            .next()
            .map(|path| String::from_utf8_lossy(path).to_string())
            .unwrap_or_default();
        entries.push(FileEntry {
            path,
            old_mode: meta[0].to_string(),
            new_mode: meta[1].to_string(),
            old_oid: meta[2].to_string(),
            new_oid: meta[3].to_string(),
            status: map_status(meta[4].chars().next().unwrap_or('?')),
        });
    }
    entries
}

fn map_status(code: char) -> DiffFileStatus {
    match code {
        'A' => DiffFileStatus::Added,
        'M' => DiffFileStatus::Modified,
        'D' => DiffFileStatus::Deleted,
        'R' => DiffFileStatus::Renamed,
        'C' => DiffFileStatus::Copied,
        'T' => DiffFileStatus::TypeChanged,
        'U' => DiffFileStatus::Unmerged,
        _ => DiffFileStatus::Other,
    }
}

fn parse_numstat(raw: &[u8]) -> HashMap<String, (u32, u32, bool)> {
    let mut counts = HashMap::new();
    for chunk in raw.split(|byte| *byte == 0) {
        if chunk.is_empty() {
            continue;
        }
        let text = String::from_utf8_lossy(chunk);
        let mut parts = text.splitn(3, '\t');
        let Some(additions) = parts.next() else {
            continue;
        };
        let Some(deletions) = parts.next() else {
            continue;
        };
        let Some(path) = parts.next() else { continue };
        if additions == "-" || deletions == "-" {
            counts.insert(path.to_string(), (0, 0, true));
            continue;
        }
        let additions = additions.parse::<u32>().unwrap_or(0);
        let deletions = deletions.parse::<u32>().unwrap_or(0);
        counts.insert(path.to_string(), (additions, deletions, false));
    }
    counts
}
