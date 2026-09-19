//! Turn checkpoints, full-state restore, and undo capture (`architecture.md` §10.3).
//!
//! Checkpoints use a temporary index, so the user's index and branch are never
//! touched. Restore rolls back worktree *and* real index, after capturing an
//! undo record that makes the restore itself reversible.

use std::io::Read;
use std::process::Stdio;
use std::time::Instant;

use tethys_schema::{
    CheckpointInfo, CheckpointPhase, CheckpointResult, RestoreOutcome, RestorePolicy,
    RestoreTarget, UndoCapture,
};

use crate::error::{GitError, GitResult};
use crate::read;
use crate::repo::GitRepo;

pub(crate) const CHECKPOINT_PREFIX: &str = "refs/tethys/checkpoints";
pub(crate) const ARCHIVED_PREFIX: &str = "refs/tethys/archived";
const RESTORE_SEGMENT: &str = "restores";
const BINARY_SNIFF_BYTES: usize = 8 * 1024;

/// Tree snapshot of a worktree plus the untracked files deliberately skipped.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Snapshot {
    pub tree: String,
    pub skipped: Vec<String>,
}

/// Checkpoint ref for a turn edge.
pub(crate) fn turn_ref(thread: &str, turn: u32, phase: CheckpointPhase) -> String {
    let edge = match phase {
        CheckpointPhase::Start => "start",
        CheckpointPhase::End => "end",
    };
    format!("{CHECKPOINT_PREFIX}/{thread}/{turn}/{edge}")
}

/// Ref holding one side of a restore's undo state.
pub(crate) fn restore_ref(thread: &str, index: u32, kind: &str) -> String {
    format!("{CHECKPOINT_PREFIX}/{thread}/{RESTORE_SEGMENT}/{index}/{kind}")
}

/// Ref a turn edge moves to on archive.
pub(crate) fn archived_ref(thread: &str, turn: u32, phase: CheckpointPhase) -> String {
    let edge = match phase {
        CheckpointPhase::Start => "start",
        CheckpointPhase::End => "end",
    };
    format!("{ARCHIVED_PREFIX}/{thread}/{turn}/{edge}")
}

/// Rejects thread ids that could escape the checkpoint namespace.
pub(crate) fn validate_thread(repo: &GitRepo, thread: &str) -> GitResult<()> {
    if thread.is_empty() || thread.len() > 200 || thread.contains(['/', '\\']) {
        return Err(GitError::InvalidArgument(format!(
            "invalid thread id: {thread:?}"
        )));
    }
    let probe = turn_ref(thread, 0, CheckpointPhase::End);
    let output = repo.command().args(["check-ref-format", &probe]).output()?;
    if !output.status.success() {
        return Err(GitError::InvalidArgument(format!(
            "invalid thread id: {thread:?}"
        )));
    }
    Ok(())
}

/// Snapshots the worktree through a temporary index, skipping configured
/// untracked binaries.
pub(crate) fn snapshot_worktree(
    repo: &GitRepo,
    tag: &str,
    skip_untracked_binary_bytes: u64,
) -> GitResult<Snapshot> {
    let index = repo.temp_index(tag);
    index.seed(repo)?;

    let mut paths = Vec::new();
    let mut skipped = Vec::new();
    for entry in read::status_entries(repo)? {
        if entry.untracked
            && skip_untracked_binary_bytes > 0
            && should_skip_untracked(repo, &entry.path, skip_untracked_binary_bytes)
        {
            skipped.push(entry.path);
        } else {
            paths.push(entry.path);
        }
    }
    if !paths.is_empty() {
        add_pathspecs(repo, &index, &paths)?;
    }
    let tree = index.write_tree(repo)?;
    Ok(Snapshot { tree, skipped })
}

fn should_skip_untracked(repo: &GitRepo, path: &str, threshold: u64) -> bool {
    let absolute = repo.worktree_root.join(path);
    let Ok(metadata) = std::fs::symlink_metadata(&absolute) else {
        return false;
    };
    if !metadata.file_type().is_file() || metadata.len() <= threshold {
        return false;
    }
    let Ok(mut file) = std::fs::File::open(&absolute) else {
        return false;
    };
    let mut buffer = [0u8; BINARY_SNIFF_BYTES];
    match file.read(&mut buffer) {
        Ok(read) => buffer[..read].contains(&0),
        Err(_) => false,
    }
}

fn add_pathspecs(
    repo: &GitRepo,
    index: &crate::repo::TempIndex,
    paths: &[String],
) -> GitResult<()> {
    use std::io::Write;

    let mut input = Vec::new();
    for path in paths {
        input.extend_from_slice(path.as_bytes());
        input.push(0);
    }
    let mut child = repo
        .command()
        .env("GIT_INDEX_FILE", index.path())
        .args(["add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(&input)?;
    }
    let output = child.wait_with_output()?;
    if !output.status.success() {
        return Err(GitError::command(
            &["add", "-A", "--pathspec-from-file=-"],
            &output,
        ));
    }
    Ok(())
}

/// Writes a start or end checkpoint and returns its ref.
pub fn create(
    repo: &GitRepo,
    thread: &str,
    turn: u32,
    phase: CheckpointPhase,
    skip_untracked_binary_bytes: u64,
) -> GitResult<CheckpointResult> {
    let started = Instant::now();
    validate_thread(repo, thread)?;

    let parent = match phase {
        CheckpointPhase::Start => latest_end_commit(repo, thread)?,
        CheckpointPhase::End => {
            match repo.rev_parse(&turn_ref(thread, turn, CheckpointPhase::Start))? {
                Some(start) => Some(start),
                None => latest_end_commit(repo, thread)?,
            }
        }
    };
    let parent = parent.or_else(|| repo.head_oid.clone());

    let tag = format!("cp_{thread}_{turn}_{phase:?}");
    let snapshot = snapshot_worktree(repo, &tag, skip_untracked_binary_bytes)?;
    let message = format!("tethys checkpoint {thread} turn {turn} {phase:?}");
    let commit_oid = commit_tree(repo, &snapshot.tree, parent.as_deref(), &message)?;
    let ref_name = turn_ref(thread, turn, phase);
    write_ref(repo, &ref_name, &commit_oid)?;

    Ok(CheckpointResult {
        thread_id: thread.to_string(),
        turn,
        phase,
        ref_name,
        commit_oid,
        tree_oid: snapshot.tree,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        skipped: snapshot.skipped,
    })
}

/// Lists a thread's checkpoints ordered by turn then phase.
pub fn list(repo: &GitRepo, thread: &str) -> GitResult<Vec<CheckpointInfo>> {
    validate_thread(repo, thread)?;
    let mut infos = Vec::new();
    for entry in list_refs(repo, &format!("{CHECKPOINT_PREFIX}/{thread}/"))? {
        let Some((turn, phase)) = parse_checkpoint_ref(&entry.refname) else {
            continue;
        };
        let Some(commit_oid) = entry.oid else {
            continue;
        };
        let tree_oid = match entry.tree {
            Some(tree) => tree,
            None => read::rev_tree(repo, &commit_oid)?.unwrap_or_default(),
        };
        infos.push(CheckpointInfo {
            thread_id: thread.to_string(),
            turn,
            phase,
            commit_oid,
            tree_oid,
            created_at_ms: entry.created_at_unix as f64 * 1000.0,
        });
    }
    infos.sort_by_key(|info| (info.turn, phase_rank(info.phase)));
    Ok(infos)
}

/// Restores a checkpoint (or explicit trees) and returns the undo capture.
pub fn restore(
    repo: &GitRepo,
    target: &RestoreTarget,
    policy: RestorePolicy,
    skip_untracked_binary_bytes: u64,
) -> GitResult<RestoreOutcome> {
    let (thread, worktree_tree, index_tree) = resolve_target(repo, target)?;

    if policy == RestorePolicy::RequireClean {
        let reference = latest_end_tree(repo, &thread)?.ok_or_else(|| {
            GitError::RestoreBlocked("no end checkpoint to compare against".to_string())
        })?;
        let current = snapshot_worktree(repo, "require_clean", skip_untracked_binary_bytes)?.tree;
        let current_index = read::index_tree(repo)?;
        if current != reference || current_index != reference {
            return Err(GitError::RestoreBlocked(
                "worktree or index differs from the latest end checkpoint".to_string(),
            ));
        }
    }

    let undo_worktree = snapshot_worktree(repo, "restore_undo", skip_untracked_binary_bytes)?.tree;
    let undo_index = read::index_tree(repo)?;
    let next = next_restore_index(repo, &thread)?;
    let undo = UndoCapture {
        worktree_ref: restore_ref(&thread, next, "worktree"),
        index_ref: restore_ref(&thread, next, "index"),
        worktree_tree: undo_worktree.clone(),
        index_tree: undo_index.clone(),
    };
    let worktree_commit =
        commit_tree(repo, &undo_worktree, None, "tethys restore undo (worktree)")?;
    let index_commit = commit_tree(repo, &undo_index, None, "tethys restore undo (index)")?;
    write_ref(repo, &undo.worktree_ref, &worktree_commit)?;
    write_ref(repo, &undo.index_ref, &index_commit)?;

    repo.git(&["read-tree", "-u", "--reset", &worktree_tree])?;
    if index_tree != worktree_tree {
        repo.git(&["read-tree", "--reset", &index_tree])?;
    }

    Ok(RestoreOutcome {
        restored_worktree_tree: worktree_tree,
        restored_index_tree: index_tree,
        undo,
    })
}

fn resolve_target(repo: &GitRepo, target: &RestoreTarget) -> GitResult<(String, String, String)> {
    match target {
        RestoreTarget::Checkpoint {
            thread_id,
            turn,
            phase,
        } => {
            validate_thread(repo, thread_id)?;
            let ref_name = turn_ref(thread_id, *turn, *phase);
            let commit = repo
                .rev_parse(&ref_name)?
                .ok_or_else(|| GitError::CheckpointNotFound(ref_name.clone()))?;
            let tree = read::rev_tree(repo, &commit)?
                .ok_or_else(|| GitError::CheckpointNotFound(ref_name.clone()))?;
            Ok((thread_id.clone(), tree.clone(), tree))
        }
        RestoreTarget::Trees {
            thread_id,
            worktree_tree,
            index_tree,
        } => {
            validate_thread(repo, thread_id)?;
            Ok((thread_id.clone(), worktree_tree.clone(), index_tree.clone()))
        }
    }
}

fn latest_end_commit(repo: &GitRepo, thread: &str) -> GitResult<Option<String>> {
    Ok(latest_end(repo, thread)?.map(|info| info.commit_oid))
}

fn latest_end_tree(repo: &GitRepo, thread: &str) -> GitResult<Option<String>> {
    Ok(latest_end(repo, thread)?.map(|info| info.tree_oid))
}

pub(crate) fn latest_end(repo: &GitRepo, thread: &str) -> GitResult<Option<CheckpointInfo>> {
    Ok(list(repo, thread)?
        .into_iter()
        .rfind(|info| info.phase == CheckpointPhase::End))
}

fn next_restore_index(repo: &GitRepo, thread: &str) -> GitResult<u32> {
    let prefix = format!("{CHECKPOINT_PREFIX}/{thread}/{RESTORE_SEGMENT}/");
    let mut max: Option<u32> = None;
    for entry in list_refs(repo, &prefix)? {
        let remainder = entry.refname.trim_start_matches(&prefix);
        let Some((index, _kind)) = remainder.split_once('/') else {
            continue;
        };
        if let Ok(index) = index.parse::<u32>() {
            max = Some(max.map_or(index, |current| current.max(index)));
        }
    }
    Ok(max.map_or(0, |current| current + 1))
}

pub(crate) fn parse_checkpoint_ref(refname: &str) -> Option<(u32, CheckpointPhase)> {
    let rest = refname
        .strip_prefix(CHECKPOINT_PREFIX)?
        .trim_start_matches('/');
    let mut parts = rest.split('/');
    let _thread = parts.next()?;
    let turn = parts.next()?.parse::<u32>().ok()?;
    let phase = match parts.next()? {
        "start" => CheckpointPhase::Start,
        "end" => CheckpointPhase::End,
        _ => return None,
    };
    Some((turn, phase))
}

fn phase_rank(phase: CheckpointPhase) -> u8 {
    match phase {
        CheckpointPhase::Start => 0,
        CheckpointPhase::End => 1,
    }
}

pub(crate) fn commit_tree(
    repo: &GitRepo,
    tree: &str,
    parent: Option<&str>,
    message: &str,
) -> GitResult<String> {
    let mut args: Vec<String> = vec![
        "-c".into(),
        "user.name=tethys".into(),
        "-c".into(),
        "user.email=tethys@localhost".into(),
        "commit-tree".into(),
        tree.into(),
    ];
    if let Some(parent) = parent {
        args.push("-p".into());
        args.push(parent.into());
    }
    args.push("-m".into());
    args.push(message.into());
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    repo.git_str(&refs)
}

pub(crate) fn write_ref(repo: &GitRepo, refname: &str, oid: &str) -> GitResult<()> {
    repo.git_ok(&["update-ref", refname, oid])
}

pub(crate) fn delete_ref(repo: &GitRepo, refname: &str) -> GitResult<()> {
    repo.git_ok(&["update-ref", "-d", refname])
}

/// One ref and its commit oid, tree, and committer time.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RefEntry {
    pub refname: String,
    pub oid: Option<String>,
    pub tree: Option<String>,
    pub created_at_unix: i64,
}

/// Lists refs under `prefix` with their oids, trees, and dates in one call.
pub(crate) fn list_refs(repo: &GitRepo, prefix: &str) -> GitResult<Vec<RefEntry>> {
    let out = repo.git(&[
        "for-each-ref",
        "--format=%(refname)%09%(objectname)%09%(tree)%09%(creatordate:unix)",
        prefix,
    ])?;
    let mut entries = Vec::new();
    for line in String::from_utf8_lossy(&out).lines() {
        let mut parts = line.split('\t');
        let Some(refname) = parts.next() else {
            continue;
        };
        if refname.is_empty() {
            continue;
        }
        let oid = parts
            .next()
            .filter(|oid| !oid.is_empty() && oid.len() == 40)
            .map(str::to_string);
        let tree = parts
            .next()
            .filter(|tree| !tree.is_empty() && tree.len() == 40)
            .map(str::to_string);
        let created_at_unix = parts
            .next()
            .and_then(|value| value.trim().parse::<i64>().ok())
            .unwrap_or(0);
        entries.push(RefEntry {
            refname: refname.to_string(),
            oid,
            tree,
            created_at_unix,
        });
    }
    Ok(entries)
}
