//! `git.*` namespace (`architecture.md` §12.1).

use tethys_schema::{
    CheckpointInfo, CheckpointPhase, CheckpointResult, CommitResult, DiffFileDetail, DiffSource,
    DiffSummary, HunkRef, RestoreOutcome, RestorePolicy, RestoreTarget, WorktreeInfo, WorktreeSpec,
};

use crate::ApiError;

/// Worktree, checkpoint, diff and commit methods.
pub trait GitApi: Send + Sync {
    /// Materializes (or registers) the worktree for a thread.
    fn git_worktree_create(
        &self,
        spec: WorktreeSpec,
    ) -> impl std::future::Future<Output = Result<WorktreeInfo, ApiError>> + Send {
        async move {
            let _ = spec;
            Err(ApiError::Unimplemented("git.worktree_create"))
        }
    }

    /// Removes a thread worktree; refuses on uncommitted work unless forced.
    fn git_worktree_remove(
        &self,
        thread_id: String,
        force: bool,
        leased: bool,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async move {
            let _ = (thread_id, force, leased);
            Err(ApiError::Unimplemented("git.worktree_remove"))
        }
    }

    /// Lists registered thread worktrees.
    fn git_worktree_list(
        &self,
    ) -> impl std::future::Future<Output = Result<Vec<WorktreeInfo>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("git.worktree_list")) }
    }

    /// Archives a thread's turn refs while keeping its worktree.
    fn git_worktree_archive(
        &self,
        thread_id: String,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async move {
            let _ = thread_id;
            Err(ApiError::Unimplemented("git.worktree_archive"))
        }
    }

    /// Writes a start or end checkpoint for a turn.
    fn git_checkpoint_create(
        &self,
        thread_id: String,
        turn: u32,
        phase: CheckpointPhase,
    ) -> impl std::future::Future<Output = Result<CheckpointResult, ApiError>> + Send {
        async move {
            let _ = (thread_id, turn, phase);
            Err(ApiError::Unimplemented("git.checkpoint_create"))
        }
    }

    /// Restores a checkpoint (or undo trees) and returns the undo capture.
    /// `None` selects the default: `RequireClean` for main-checkout threads,
    /// `Force` otherwise.
    fn git_checkpoint_restore(
        &self,
        target: RestoreTarget,
        policy: Option<RestorePolicy>,
    ) -> impl std::future::Future<Output = Result<RestoreOutcome, ApiError>> + Send {
        async move {
            let _ = (target, policy);
            Err(ApiError::Unimplemented("git.checkpoint_restore"))
        }
    }

    /// Lists a thread's checkpoints.
    fn git_checkpoint_list(
        &self,
        thread_id: String,
    ) -> impl std::future::Future<Output = Result<Vec<CheckpointInfo>, ApiError>> + Send {
        async move {
            let _ = thread_id;
            Err(ApiError::Unimplemented("git.checkpoint_list"))
        }
    }

    /// Aggregated diff for one anchor pair.
    fn git_diff_summary(
        &self,
        source: DiffSource,
    ) -> impl std::future::Future<Output = Result<DiffSummary, ApiError>> + Send {
        async move {
            let _ = source;
            Err(ApiError::Unimplemented("git.diff_summary"))
        }
    }

    /// Full content diff for one path.
    fn git_diff_file(
        &self,
        source: DiffSource,
        path: String,
    ) -> impl std::future::Future<Output = Result<DiffFileDetail, ApiError>> + Send {
        async move {
            let _ = (source, path);
            Err(ApiError::Unimplemented("git.diff_file"))
        }
    }

    /// Stages paths in the thread's index.
    fn git_stage(
        &self,
        thread_id: String,
        paths: Vec<String>,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async move {
            let _ = (thread_id, paths);
            Err(ApiError::Unimplemented("git.stage"))
        }
    }

    /// Unstages paths from the thread's index.
    fn git_unstage(
        &self,
        thread_id: String,
        paths: Vec<String>,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async move {
            let _ = (thread_id, paths);
            Err(ApiError::Unimplemented("git.unstage"))
        }
    }

    /// Discards selected hunks (or every live change) in a thread.
    fn git_discard(
        &self,
        thread_id: String,
        source: DiffSource,
        hunks: Option<Vec<HunkRef>>,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async move {
            let _ = (thread_id, source, hunks);
            Err(ApiError::Unimplemented("git.discard"))
        }
    }

    /// Commits staged work on the thread branch.
    fn git_commit(
        &self,
        thread_id: String,
        message: String,
    ) -> impl std::future::Future<Output = Result<CommitResult, ApiError>> + Send {
        async move {
            let _ = (thread_id, message);
            Err(ApiError::Unimplemented("git.commit"))
        }
    }

    fn git_merge(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("git.merge")) }
    }

    fn git_push(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("git.push")) }
    }

    fn git_pr_create(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("git.pr_create")) }
    }
}
