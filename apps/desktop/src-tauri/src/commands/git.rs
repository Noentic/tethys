//! `git.*` commands.

use tauri::State;
use tethys_api::GitApi;
use tethys_schema::{
    CheckpointInfo, CheckpointPhase, CheckpointResult, CommitResult, DiffFileDetail, DiffSource,
    DiffSummary, HunkRef, RestoreOutcome, RestorePolicy, RestoreTarget, WorktreeInfo, WorktreeSpec,
};

use crate::commands::CoreState;

/// `git.worktree_create` — materialize or register a thread worktree.
#[tauri::command]
#[specta::specta]
pub async fn git_worktree_create(
    state: State<'_, CoreState>,
    spec: WorktreeSpec,
) -> Result<WorktreeInfo, String> {
    state
        .git_worktree_create(spec)
        .await
        .map_err(|e| e.to_string())
}

/// `git.worktree_remove` — delete guard runs in the engine.
#[tauri::command]
#[specta::specta]
pub async fn git_worktree_remove(
    state: State<'_, CoreState>,
    thread_id: String,
    force: bool,
    leased: bool,
) -> Result<(), String> {
    state
        .git_worktree_remove(thread_id, force, leased)
        .await
        .map_err(|e| e.to_string())
}

/// `git.worktree_list` — registered thread worktrees.
#[tauri::command]
#[specta::specta]
pub async fn git_worktree_list(state: State<'_, CoreState>) -> Result<Vec<WorktreeInfo>, String> {
    state.git_worktree_list().await.map_err(|e| e.to_string())
}

/// `git.worktree_archive` — keep the worktree, archive turn refs.
#[tauri::command]
#[specta::specta]
pub async fn git_worktree_archive(
    state: State<'_, CoreState>,
    thread_id: String,
) -> Result<(), String> {
    state
        .git_worktree_archive(thread_id)
        .await
        .map_err(|e| e.to_string())
}

/// `git.checkpoint_create` — start/end turn checkpoint.
#[tauri::command]
#[specta::specta]
pub async fn git_checkpoint_create(
    state: State<'_, CoreState>,
    thread_id: String,
    turn: u32,
    phase: CheckpointPhase,
) -> Result<CheckpointResult, String> {
    state
        .git_checkpoint_create(thread_id, turn, phase)
        .await
        .map_err(|e| e.to_string())
}

/// `git.checkpoint_restore` — full-state restore returning the undo capture.
#[tauri::command]
#[specta::specta]
pub async fn git_checkpoint_restore(
    state: State<'_, CoreState>,
    target: RestoreTarget,
    policy: Option<RestorePolicy>,
) -> Result<RestoreOutcome, String> {
    state
        .git_checkpoint_restore(target, policy)
        .await
        .map_err(|e| e.to_string())
}

/// `git.checkpoint_list` — turn checkpoints for a thread.
#[tauri::command]
#[specta::specta]
pub async fn git_checkpoint_list(
    state: State<'_, CoreState>,
    thread_id: String,
) -> Result<Vec<CheckpointInfo>, String> {
    state
        .git_checkpoint_list(thread_id)
        .await
        .map_err(|e| e.to_string())
}

/// `git.diff_summary` — files changed for an anchor pair.
#[tauri::command]
#[specta::specta]
pub async fn git_diff_summary(
    state: State<'_, CoreState>,
    source: DiffSource,
) -> Result<DiffSummary, String> {
    state
        .git_diff_summary(source)
        .await
        .map_err(|e| e.to_string())
}

/// `git.diff_file` — hunk detail for one path.
#[tauri::command]
#[specta::specta]
pub async fn git_diff_file(
    state: State<'_, CoreState>,
    source: DiffSource,
    path: String,
) -> Result<DiffFileDetail, String> {
    state
        .git_diff_file(source, path)
        .await
        .map_err(|e| e.to_string())
}

/// `git.stage` — stage paths in the thread's index.
#[tauri::command]
#[specta::specta]
pub async fn git_stage(
    state: State<'_, CoreState>,
    thread_id: String,
    paths: Vec<String>,
) -> Result<(), String> {
    state
        .git_stage(thread_id, paths)
        .await
        .map_err(|e| e.to_string())
}

/// `git.unstage` — unstage paths from the thread's index.
#[tauri::command]
#[specta::specta]
pub async fn git_unstage(
    state: State<'_, CoreState>,
    thread_id: String,
    paths: Vec<String>,
) -> Result<(), String> {
    state
        .git_unstage(thread_id, paths)
        .await
        .map_err(|e| e.to_string())
}

/// `git.discard` — discard hunks (or all live changes).
#[tauri::command]
#[specta::specta]
pub async fn git_discard(
    state: State<'_, CoreState>,
    thread_id: String,
    source: DiffSource,
    hunks: Option<Vec<HunkRef>>,
) -> Result<(), String> {
    state
        .git_discard(thread_id, source, hunks)
        .await
        .map_err(|e| e.to_string())
}

/// `git.commit` — commit staged work on the thread branch.
#[tauri::command]
#[specta::specta]
pub async fn git_commit(
    state: State<'_, CoreState>,
    thread_id: String,
    message: String,
) -> Result<CommitResult, String> {
    state
        .git_commit(thread_id, message)
        .await
        .map_err(|e| e.to_string())
}

// merge / push / pr_create arrive with M2.6.
stub_cmd!(git_merge);
stub_cmd!(git_push);
stub_cmd!(git_pr_create);
