//! Archive and delete guards (WT-06).
//!
//! Delete refuses to silently drop uncommitted work; archive preserves the
//! turn refs under `refs/tethys/archived/<thread>/...` and keeps the worktree.

use std::path::Path;

use tethys_schema::WorktreeInfo;

use crate::checkpoint::{self, ARCHIVED_PREFIX, CHECKPOINT_PREFIX};
use crate::error::{GitError, GitResult};
use crate::read;
use crate::repo::GitRepo;

/// Removes a worktree, refusing unless it is clean or `force` is set.
pub fn delete(repo: &GitRepo, info: &WorktreeInfo, force: bool, leased: bool) -> GitResult<()> {
    if info.main_checkout {
        return Err(GitError::InvalidArgument(
            "the main checkout cannot be deleted".to_string(),
        ));
    }

    let path = Path::new(&info.path);
    if path.is_dir() {
        let worktree = GitRepo::discover(path).unwrap_or_else(|_| repo.clone());
        let uncommitted = read::uncommitted_paths(&worktree)?;
        let unpushed = read::unpushed_commits(&worktree)?;
        if leased || (!force && (!uncommitted.is_empty() || !unpushed.is_empty())) {
            return Err(GitError::DeleteBlocked {
                uncommitted,
                unpushed,
                leased,
            });
        }
        let mut args = vec!["worktree", "remove"];
        if force || !uncommitted.is_empty() {
            args.push("--force");
        }
        args.push(&info.path);
        repo.git_ok(&args)?;
    }
    repo.git_ok(&["worktree", "prune"])?;

    if !info.branch.is_empty() {
        let args = ["branch", "-D", &info.branch];
        let _ = repo.git_ok(&args);
    }

    delete_thread_refs(repo, &info.thread_id)
}

/// Moves a thread's turn refs into the archived namespace, keeping the newest
/// restore capture. The worktree and branch stay in place.
pub fn archive(repo: &GitRepo, thread_id: &str) -> GitResult<()> {
    checkpoint::validate_thread(repo, thread_id)?;
    let checkpoint_prefix = format!("{CHECKPOINT_PREFIX}/{thread_id}/");
    let restore_prefix = format!("{checkpoint_prefix}restores/");

    let mut newest_restore: Option<u32> = None;
    let mut restore_refs: Vec<(u32, String)> = Vec::new();
    for entry in checkpoint::list_refs(repo, &checkpoint_prefix)? {
        if let Some(remainder) = entry.refname.strip_prefix(&restore_prefix) {
            if let Some((index, _kind)) = remainder.split_once('/') {
                if let Ok(index) = index.parse::<u32>() {
                    newest_restore = Some(newest_restore.map_or(index, |max| max.max(index)));
                    restore_refs.push((index, entry.refname));
                }
            }
            continue;
        }
        if let Some((turn, phase)) = checkpoint::parse_checkpoint_ref(&entry.refname) {
            if let Some(oid) = entry.oid {
                let target = checkpoint::archived_ref(thread_id, turn, phase);
                checkpoint::write_ref(repo, &target, &oid)?;
                checkpoint::delete_ref(repo, &entry.refname)?;
            }
        }
    }

    for (index, refname) in restore_refs {
        if Some(index) != newest_restore {
            checkpoint::delete_ref(repo, &refname)?;
        }
    }
    Ok(())
}

/// Deletes every ref belonging to a thread, archived included.
pub fn delete_thread_refs(repo: &GitRepo, thread_id: &str) -> GitResult<()> {
    checkpoint::validate_thread(repo, thread_id)?;
    for prefix in [
        format!("{CHECKPOINT_PREFIX}/{thread_id}/"),
        format!("{ARCHIVED_PREFIX}/{thread_id}/"),
    ] {
        for entry in checkpoint::list_refs(repo, &prefix)? {
            checkpoint::delete_ref(repo, &entry.refname)?;
        }
    }
    Ok(())
}
