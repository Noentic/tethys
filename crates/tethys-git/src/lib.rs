//! Git engine: worktrees, checkpoints, diffs, and discard (`architecture.md` §10).
//!
//! The engine is synchronous and side-effect explicit: callers pass specs and
//! thresholds, the crate never reads app config. Async hosts offload it with
//! `spawn_blocking`. All mutations are serialized per engine (one worktree).

mod archive;
mod bootstrap;
mod checkpoint;
mod commit;
mod diff;
mod error;
mod hunks;
mod index;
mod read;
mod repo;
mod setup;
mod worktree;

use parking_lot::Mutex;
use std::path::Path;

pub use error::{GitError, GitResult};
pub use repo::GitRepo;
pub use setup::SetupRunner;
pub use worktree::default_worktree_path;

use hunks::DiffCache;
use tethys_schema::{
    CheckpointInfo, CheckpointPhase, CheckpointResult, CommitResult, DiffFileDetail, DiffSource,
    DiffSummary, HunkRef, RestoreOutcome, RestorePolicy, RestoreTarget, WorktreeInfo, WorktreeSpec,
};

/// Tunables the caller resolves from project config.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GitOptions {
    /// Untracked binaries above this size are skipped by checkpoints.
    pub skip_untracked_binary_bytes: u64,
}

impl Default for GitOptions {
    fn default() -> Self {
        Self {
            skip_untracked_binary_bytes: 10 * 1024 * 1024,
        }
    }
}

/// Engine bound to one discovered worktree.
#[derive(Debug)]
pub struct GitEngine {
    repo: GitRepo,
    options: GitOptions,
    mutation: Mutex<()>,
    diff_cache: Mutex<DiffCache>,
}

impl GitEngine {
    /// Opens the repository containing `root` with default options.
    pub fn open(root: &Path) -> GitResult<Self> {
        Self::open_with(root, GitOptions::default())
    }

    /// Opens the repository containing `root` with explicit options.
    pub fn open_with(root: &Path, options: GitOptions) -> GitResult<Self> {
        Ok(Self {
            repo: GitRepo::discover(root)?,
            options,
            mutation: Mutex::new(()),
            diff_cache: Mutex::new(DiffCache::default()),
        })
    }

    /// Resolved repository locations.
    pub fn repo(&self) -> &GitRepo {
        &self.repo
    }

    /// Creates (or registers) a thread worktree.
    pub fn worktree_create(
        &self,
        spec: &WorktreeSpec,
        runner: &dyn SetupRunner,
    ) -> GitResult<WorktreeInfo> {
        let _guard = self.mutation.lock();
        worktree::create(&self.repo, spec, runner)
    }

    /// Removes a worktree after the delete guard passes.
    pub fn worktree_delete(&self, info: &WorktreeInfo, force: bool, leased: bool) -> GitResult<()> {
        let _guard = self.mutation.lock();
        archive::delete(&self.repo, info, force, leased)
    }

    /// Archives a thread's turn refs while keeping the worktree.
    pub fn worktree_archive(&self, thread_id: &str) -> GitResult<()> {
        let _guard = self.mutation.lock();
        archive::archive(&self.repo, thread_id)
    }

    /// Writes a start or end checkpoint for a turn.
    pub fn checkpoint_create(
        &self,
        thread_id: &str,
        turn: u32,
        phase: CheckpointPhase,
    ) -> GitResult<CheckpointResult> {
        let _guard = self.mutation.lock();
        checkpoint::create(
            &self.repo,
            thread_id,
            turn,
            phase,
            self.options.skip_untracked_binary_bytes,
        )
    }

    /// Lists a thread's checkpoints.
    pub fn checkpoint_list(&self, thread_id: &str) -> GitResult<Vec<CheckpointInfo>> {
        checkpoint::list(&self.repo, thread_id)
    }

    /// Restores a checkpoint (or explicit trees) and returns the undo capture.
    pub fn restore(
        &self,
        target: &RestoreTarget,
        policy: RestorePolicy,
    ) -> GitResult<RestoreOutcome> {
        let _guard = self.mutation.lock();
        checkpoint::restore(
            &self.repo,
            target,
            policy,
            self.options.skip_untracked_binary_bytes,
        )
    }

    /// Aggregated diff for an anchor pair.
    pub fn diff_summary(&self, source: &DiffSource) -> GitResult<DiffSummary> {
        diff::summary(&self.repo, source, self.options.skip_untracked_binary_bytes)
    }

    /// Full content diff for one path.
    pub fn diff_file(&self, source: &DiffSource, path: &str) -> GitResult<DiffFileDetail> {
        let mut cache = self.diff_cache.lock();
        diff::file_detail(
            &self.repo,
            source,
            path,
            &mut cache,
            self.options.skip_untracked_binary_bytes,
        )
    }

    /// Stages paths in the real index.
    pub fn stage(&self, paths: &[String]) -> GitResult<()> {
        let _guard = self.mutation.lock();
        index::stage(&self.repo, paths)
    }

    /// Unstages paths from the real index.
    pub fn unstage(&self, paths: &[String]) -> GitResult<()> {
        let _guard = self.mutation.lock();
        index::unstage(&self.repo, paths)
    }

    /// Discards selected hunks, or every change in a live anchor.
    pub fn discard(&self, source: &DiffSource, hunks: Option<&[HunkRef]>) -> GitResult<()> {
        let _guard = self.mutation.lock();
        let mut cache = self.diff_cache.lock();
        index::discard(
            &self.repo,
            source,
            hunks,
            &mut cache,
            self.options.skip_untracked_binary_bytes,
        )
    }

    /// Commits staged work on the thread branch.
    pub fn commit(&self, message: &str, paths: Option<&[String]>) -> GitResult<CommitResult> {
        let _guard = self.mutation.lock();
        commit::commit(&self.repo, message, paths)
    }
}
