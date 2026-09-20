//! `git.*` implementations.

use std::path::Path;
use std::time::Duration;

use tethys_api::{ApiError, GitApi};
use tethys_git::{default_worktree_path, GitError, GitOptions};
use tethys_schema::{
    CheckpointInfo, CheckpointPhase, CheckpointResult, CommitResult, DiffFileDetail, DiffSource,
    DiffSummary, HunkRef, RestoreOutcome, RestorePolicy, RestoreTarget, WorktreeInfo, WorktreeSpec,
};

use crate::git_registry::{load_git_config, ProcessSetupRunner};
use crate::{
    blocking, fallback_source, map_git_error, restore_thread, source_thread, worktree_path_allowed,
    Core,
};

impl GitApi for Core {
    async fn git_worktree_create(&self, mut spec: WorktreeSpec) -> Result<WorktreeInfo, ApiError> {
        let root = self.workspace_roots.root(&spec.workspace_id).await?;
        let root_str = root.display().to_string();
        let config = load_git_config(&root_str)?;
        let options = GitOptions {
            skip_untracked_binary_bytes: u64::from(config.skip_untracked_binary_bytes),
        };
        let engine = self
            .git
            .lock()
            .engine(&root_str, options)
            .map_err(map_git_error)?;

        // The webview names the path; keep it inside the workspace root or the
        // worktrees directory so a non-empty spec cannot escape.
        if !spec.path.trim().is_empty() {
            let candidate = Path::new(&spec.path);
            if !worktree_path_allowed(&root, &self.sync_home(), &config, candidate) {
                return Err(ApiError::InvalidConfig(format!(
                    "worktree path is outside the workspace root and worktrees directory: {}",
                    spec.path
                )));
            }
        }

        if spec.path.trim().is_empty() {
            spec.path = match config.worktrees_dir.as_deref().map(str::trim) {
                Some(dir) if !dir.is_empty() => Path::new(dir)
                    .join(&spec.slug)
                    .to_string_lossy()
                    .into_owned(),
                _ => default_worktree_path(&root, &spec.slug).map_err(map_git_error)?,
            };
        }
        if spec.branch.trim().is_empty() {
            spec.branch = config.wt_branch_template.replace("{slug}", &spec.slug);
        }
        if spec.bootstrap_globs.is_empty() {
            spec.bootstrap_globs = config.bootstrap_globs.clone();
        }

        let runner = ProcessSetupRunner {
            timeout: Duration::from_millis(u64::from(config.setup_timeout_ms.max(1))),
        };
        let engine_for_task = engine.clone();
        let spec_for_task = spec.clone();
        let info =
            blocking(move || engine_for_task.worktree_create(&spec_for_task, &runner)).await?;

        // Thread operations run against the worktree, not the main checkout.
        let worktree_engine = {
            let mut registry = self.git.lock();
            registry.engine(&info.path, options)
        }
        .map_err(map_git_error)?;
        self.git
            .lock()
            .register(info.clone(), worktree_engine, config);
        Ok(info)
    }

    async fn git_worktree_remove(
        &self,
        thread_id: String,
        force: bool,
        leased: bool,
    ) -> Result<(), ApiError> {
        let registered = self.registered(&thread_id)?;
        let options = GitOptions {
            skip_untracked_binary_bytes: u64::from(registered.config.skip_untracked_binary_bytes),
        };
        // Removal must run from the main checkout: the worktree directory
        // disappears mid-operation.
        let main_engine = {
            let mut registry = self.git.lock();
            registry.engine(&registered.info.workspace_root, options)
        }
        .map_err(map_git_error)?;
        let info = registered.info.clone();
        let worktree_path = info.path.clone();
        blocking(move || main_engine.worktree_delete(&info, force, leased)).await?;
        self.git.lock().remove(&thread_id);
        self.search.drop_index(Path::new(&worktree_path));
        Ok(())
    }

    async fn git_worktree_list(&self) -> Result<Vec<WorktreeInfo>, ApiError> {
        Ok(self.git.lock().list())
    }

    async fn git_worktree_archive(&self, thread_id: String) -> Result<(), ApiError> {
        let registered = self.registered(&thread_id)?;
        let worktree_path = registered.info.path.clone();
        blocking(move || registered.engine.worktree_archive(&thread_id)).await?;
        self.search.drop_index(Path::new(&worktree_path));
        Ok(())
    }

    async fn git_checkpoint_create(
        &self,
        thread_id: String,
        turn: u32,
        phase: CheckpointPhase,
    ) -> Result<CheckpointResult, ApiError> {
        let registered = self.registered(&thread_id)?;
        let engine = registered.engine.clone();
        let thread = thread_id.clone();
        blocking(move || engine.checkpoint_create(&thread, turn, phase)).await
    }

    async fn git_checkpoint_restore(
        &self,
        target: RestoreTarget,
        policy: Option<RestorePolicy>,
    ) -> Result<RestoreOutcome, ApiError> {
        let thread_id = restore_thread(&target).to_string();
        let registered = self.registered(&thread_id)?;
        let policy = policy.unwrap_or(if registered.info.main_checkout {
            RestorePolicy::RequireClean
        } else {
            RestorePolicy::Force
        });
        blocking(move || registered.engine.restore(&target, policy)).await
    }

    async fn git_checkpoint_list(
        &self,
        thread_id: String,
    ) -> Result<Vec<CheckpointInfo>, ApiError> {
        let registered = self.registered(&thread_id)?;
        let thread = thread_id.clone();
        blocking(move || registered.engine.checkpoint_list(&thread)).await
    }

    async fn git_diff_summary(&self, source: DiffSource) -> Result<DiffSummary, ApiError> {
        let registered = self.registered(source_thread(&source))?;
        let engine = registered.engine.clone();
        blocking(move || match engine.diff_summary(&source) {
            Err(GitError::CheckpointNotFound(_)) => match fallback_source(&source) {
                Some(fallback) => engine.diff_summary(&fallback),
                None => engine.diff_summary(&source),
            },
            other => other,
        })
        .await
    }

    async fn git_diff_file(
        &self,
        source: DiffSource,
        path: String,
    ) -> Result<DiffFileDetail, ApiError> {
        let registered = self.registered(source_thread(&source))?;
        let engine = registered.engine.clone();
        blocking(move || engine.diff_file(&source, &path)).await
    }

    async fn git_stage(&self, thread_id: String, paths: Vec<String>) -> Result<(), ApiError> {
        let registered = self.registered(&thread_id)?;
        blocking(move || registered.engine.stage(&paths)).await
    }

    async fn git_unstage(&self, thread_id: String, paths: Vec<String>) -> Result<(), ApiError> {
        let registered = self.registered(&thread_id)?;
        blocking(move || registered.engine.unstage(&paths)).await
    }

    async fn git_discard(
        &self,
        thread_id: String,
        source: DiffSource,
        hunks: Option<Vec<HunkRef>>,
    ) -> Result<(), ApiError> {
        let registered = self.registered(&thread_id)?;
        blocking(move || registered.engine.discard(&source, hunks.as_deref())).await
    }

    async fn git_commit(
        &self,
        thread_id: String,
        message: String,
    ) -> Result<CommitResult, ApiError> {
        let registered = self.registered(&thread_id)?;
        blocking(move || registered.engine.commit(&message, None)).await
    }
}
