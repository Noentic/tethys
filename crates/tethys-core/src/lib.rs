//! Orchestrator and domain core (implements `tethys-api`).

pub mod composer;
mod git_registry;
pub mod mcp;
pub mod skills;
pub mod synthetic;
pub mod thread_session;
pub mod workspace_roots;

pub use git_registry::ThreadRuntimeState;
pub use workspace_roots::{StaticWorkspaces, StoreWorkspaceRoots, WorkspaceRoots};

use parking_lot::Mutex;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tethys_agent_servers::{ConnectionStore, StoreOptions};
use tethys_api::{ApiError, TethysApi};
use tethys_git::{default_worktree_path, GitError, GitOptions};
use tethys_schema::composer::{CommandInfo, ExpandedCommand};
use tethys_schema::connection::{AcpProtocol, AgentCompat, ConnectionEntry};
use tethys_schema::sync::WorkspaceId;
use tethys_schema::thread::{ContentBlock, CreateThread, ThreadId, ThreadSummary, ThreadView};
use tethys_schema::{
    CheckpointInfo, CheckpointPhase, CheckpointResult, CommitResult, DiffFileDetail, DiffHunk,
    DiffSource, DiffSummary, HealthStatus, HostInfo, HunkRef, RestoreOutcome, RestorePolicy,
    RestoreTarget, SearchItem, WorktreeInfo, WorktreeSpec,
};
use tethys_search::{SearchError, SearchIndexManager};

use crate::composer::{expand_command, global_commands_dir, list_commands, SkillCandidate};
use crate::thread_session::{DenyPermissionResolver, ThreadSessions};
use git_registry::{load_git_config, GitRegistry, ProcessSetupRunner, RegisteredWorktree};

/// Resolved paths used to bootstrap Core and open persistent state.
#[derive(Debug, Clone)]
pub struct CorePaths {
    pub home: PathBuf,
}

impl CorePaths {
    pub fn new(home: impl Into<PathBuf>) -> Self {
        Self { home: home.into() }
    }

    pub fn from_home_or_default() -> Self {
        Self {
            home: dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")),
        }
    }

    pub fn tethys_dir(&self) -> PathBuf {
        self.home.join(".tethys")
    }

    pub fn db_path(&self) -> PathBuf {
        self.tethys_dir().join("state.db")
    }
}

impl From<PathBuf> for CorePaths {
    fn from(home: PathBuf) -> Self {
        Self { home }
    }
}

impl From<&Path> for CorePaths {
    fn from(home: &Path) -> Self {
        Self { home: home.to_path_buf() }
    }
}

impl From<&PathBuf> for CorePaths {
    fn from(home: &PathBuf) -> Self {
        Self { home: home.clone() }
    }
}

impl From<&str> for CorePaths {
    fn from(home: &str) -> Self {
        Self { home: PathBuf::from(home) }
    }
}

pub struct Core {
    version: String,
    search: SearchIndexManager,
    git: Mutex<GitRegistry>,
    sessions: Arc<ThreadSessions>,
    store: Option<Arc<tethys_store::EventStore>>,
    workspace_roots: Arc<dyn WorkspaceRoots>,
}

impl Default for Core {
    fn default() -> Self {
        Self::new("0.0.0")
    }
}

impl Core {
    pub fn new(version: impl Into<String>) -> Self {
        let store = ConnectionStore::new(StoreOptions::new(
            AcpProtocol::V1,
            Arc::new(DenyPermissionResolver),
        ));
        let home = dirs::home_dir().unwrap_or_default();
        let sync =
            crate::thread_session::SyncSource::new(home, Arc::new(tethys_sync::KeyringSecrets));
        Self::with_sessions(
            version,
            Arc::new(ThreadSessions::new(
                store,
                sync,
                Arc::new(workspace_roots::StaticWorkspaces::new()),
            )),
        )
    }

    pub fn with_sessions(version: impl Into<String>, sessions: Arc<ThreadSessions>) -> Self {
        Self {
            version: version.into(),
            search: SearchIndexManager::new(),
            git: Mutex::new(GitRegistry::default()),
            sessions,
            store: None,
            workspace_roots: Arc::new(workspace_roots::StaticWorkspaces::new()),
        }
    }

    /// Bootstraps Core at the configured paths, opening SQLite store and wiring sync state.
    pub async fn open(paths: impl Into<CorePaths>) -> Result<Self, ApiError> {
        let paths = paths.into();
        let home = paths.home.clone();
        let db_path = paths.db_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| ApiError::Internal(e.to_string()))?;
        }
        let store = Arc::new(
            tethys_store::EventStore::open(&db_path)
                .await
                .map_err(|e| ApiError::Internal(e.to_string()))?,
        );
        let sync = crate::thread_session::SyncSource::new(home, Arc::new(tethys_sync::KeyringSecrets));
        let agent_store = ConnectionStore::new(StoreOptions::new(
            AcpProtocol::V1,
            Arc::new(DenyPermissionResolver),
        ));
        let workspace_roots = Arc::new(workspace_roots::StoreWorkspaceRoots::new((*store).clone()));
        let sessions = Arc::new(ThreadSessions::new(agent_store, sync, workspace_roots.clone()));
        let core = Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            search: SearchIndexManager::new(),
            git: Mutex::new(GitRegistry::default()),
            sessions,
            store: Some(store),
            workspace_roots,
        };
        Ok(core)
    }

    /// Attaches the sync-state store (projection ownership and skill rows).
    pub fn with_store(mut self, store: Arc<tethys_store::EventStore>) -> Self {
        let roots = Arc::new(workspace_roots::StoreWorkspaceRoots::new((*store).clone()));
        self.sessions.set_roots(roots.clone());
        self.workspace_roots = roots;
        self.store = Some(store);
        self
    }

    pub fn with_workspace_roots(mut self, roots: Arc<dyn WorkspaceRoots>) -> Self {
        self.sessions.set_roots(roots.clone());
        self.workspace_roots = roots;
        self
    }

    pub fn workspace_roots(&self) -> &Arc<dyn WorkspaceRoots> {
        &self.workspace_roots
    }

    pub fn sync_store(&self) -> Result<&Arc<tethys_store::EventStore>, ApiError> {
        self.store
            .as_ref()
            .ok_or_else(|| ApiError::Internal("sync store not configured".into()))
    }

    pub(crate) fn sync_home(&self) -> std::path::PathBuf {
        self.sessions.sync().home.clone()
    }

    /// Trusted, enabled skills as composer candidates; empty without a store.
    async fn skill_candidates(
        &self,
        workspace_root: Option<&Path>,
    ) -> Result<Vec<SkillCandidate>, ApiError> {
        let Ok(store) = self.sync_store() else {
            return Ok(Vec::new());
        };
        let home = self.sync_home();
        let root = workspace_root.unwrap_or(home.as_path());
        let listed =
            tethys_sync::skills::list(store, tethys_sync::skills::SkillHome { root, home: &home })
                .await
                .map_err(|error| ApiError::Internal(error.to_string()))?;

        Ok(listed
            .into_iter()
            .filter(|skill| skill.enabled && skill.trusted)
            .map(|skill| SkillCandidate {
                name: skill.name,
                path: PathBuf::from(skill.path),
            })
            .collect())
    }

    pub fn sessions(&self) -> &Arc<ThreadSessions> {
        &self.sessions
    }

    pub fn register_profile(
        &self,
        spec: tethys_agent_servers::LaunchSpec,
        compat: AgentCompat,
    ) -> String {
        self.sessions.register_profile(spec, compat)
    }

    /// Reports a thread runtime transition; Core places start/end checkpoints
    /// on the edges of `Running` (M1.2 supervisor is the eventual caller).
    pub async fn on_thread_state(
        &self,
        thread_id: &str,
        turn: u32,
        state: ThreadRuntimeState,
    ) -> Result<(), ApiError> {
        let registered = { self.git.lock().get(thread_id).cloned() };
        let Some(registered) = registered else {
            return Ok(());
        };
        let phase = match (registered.last_state, state) {
            (ThreadRuntimeState::Running, ThreadRuntimeState::Running) => None,
            (_, ThreadRuntimeState::Running) => Some(CheckpointPhase::Start),
            (ThreadRuntimeState::Running, _) => Some(CheckpointPhase::End),
            _ => None,
        };
        if let Some(phase) = phase {
            let engine = registered.engine.clone();
            let thread = thread_id.to_string();
            blocking(move || engine.checkpoint_create(&thread, turn, phase)).await?;
        }
        self.git.lock().set_state(thread_id, state);
        Ok(())
    }

    fn registered(&self, thread_id: &str) -> Result<RegisteredWorktree, ApiError> {
        self.git.lock().get(thread_id).cloned().ok_or_else(|| {
            ApiError::Internal(format!("no worktree registered for thread {thread_id}"))
        })
    }
}

impl TethysApi for Core {
    async fn host_info(&self) -> Result<HostInfo, ApiError> {
        Ok(HostInfo {
            version: self.version.clone(),
            platform: std::env::consts::OS.to_string(),
        })
    }

    async fn health(&self) -> Result<HealthStatus, ApiError> {
        Ok(HealthStatus {
            ok: true,
            core_version: self.version.clone(),
        })
    }

    async fn search_files(
        &self,
        workspace_id: WorkspaceId,
        query: String,
        limit: usize,
    ) -> Result<Vec<SearchItem>, ApiError> {
        let root = self.workspace_roots.root(&workspace_id).await?;
        self.search
            .query(&root, &query, limit)
            .map_err(map_search_error)
    }

    async fn commands_list(
        &self,
        workspace_id: Option<WorkspaceId>,
    ) -> Result<Vec<CommandInfo>, ApiError> {
        let home = self.sync_home();
        let global = global_commands_dir(&home);
        let root = match workspace_id {
            Some(ref id) => Some(self.workspace_roots.root(id).await?),
            None => None,
        };
        list_commands(&global, root.as_deref())
    }

    async fn commands_expand(
        &self,
        command: String,
        args_text: String,
        workspace_id: Option<WorkspaceId>,
    ) -> Result<ExpandedCommand, ApiError> {
        let home = self.sync_home();
        let global = global_commands_dir(&home);
        let root = match workspace_id {
            Some(ref id) => Some(self.workspace_roots.root(id).await?),
            None => None,
        };
        let skills = self.skill_candidates(root.as_deref()).await?;
        expand_command(&global, root.as_deref(), &skills, &command, &args_text)
    }

    async fn thread_create(&self, request: CreateThread) -> Result<ThreadSummary, ApiError> {
        self.sessions.create(request).await
    }

    async fn thread_list(&self) -> Result<Vec<ThreadSummary>, ApiError> {
        Ok(self.sessions.list())
    }

    async fn thread_get(&self, id: ThreadId) -> Result<ThreadView, ApiError> {
        self.sessions.get(&id)
    }

    async fn thread_prompt(&self, id: ThreadId, blocks: Vec<ContentBlock>) -> Result<(), ApiError> {
        self.sessions.prompt(&id, blocks).await
    }

    async fn thread_cancel(&self, id: ThreadId) -> Result<(), ApiError> {
        self.sessions.cancel(&id).await
    }

    async fn thread_resume(&self, id: ThreadId) -> Result<(), ApiError> {
        self.sessions.resume(&id).await
    }

    async fn thread_archive(&self, id: ThreadId) -> Result<(), ApiError> {
        self.sessions.archive(&id)
    }

    async fn thread_delete(&self, id: ThreadId) -> Result<(), ApiError> {
        self.sessions.delete(&id)
    }

    async fn events_subscribe(
        &self,
        thread_id: ThreadId,
        since_seq: u32,
    ) -> Result<tethys_api::EventStream, ApiError> {
        self.sessions.subscribe(&thread_id, since_seq)
    }

    async fn agent_connections_list(&self) -> Result<Vec<ConnectionEntry>, ApiError> {
        Ok(self.sessions.connections())
    }

    async fn agent_connections_restart(&self, profile_id: String) -> Result<(), ApiError> {
        self.sessions.restart_connection(&profile_id).await
    }

    async fn generate_synthetic_diff(&self, line_count: usize) -> Result<Vec<DiffHunk>, ApiError> {
        Ok(synthetic::generate_synthetic_diff(line_count))
    }

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

async fn blocking<T, F>(operation: F) -> Result<T, ApiError>
where
    F: FnOnce() -> Result<T, GitError> + Send + 'static,
    T: Send + 'static,
{
    match tokio::task::spawn_blocking(operation).await {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(error)) => Err(map_git_error(error)),
        Err(join_error) => Err(ApiError::Internal(format!(
            "blocking git task failed: {join_error}"
        ))),
    }
}

fn map_search_error(error: SearchError) -> ApiError {
    match error {
        SearchError::IndexWarming { path } => ApiError::IndexWarming(path.display().to_string()),
        other => ApiError::Internal(other.to_string()),
    }
}

fn map_git_error(error: GitError) -> ApiError {
    match error {
        GitError::DeleteBlocked {
            uncommitted,
            unpushed,
            leased,
        } => ApiError::DeleteBlocked {
            uncommitted,
            unpushed,
            leased,
        },
        other => ApiError::Git(other.to_string()),
    }
}

fn source_thread(source: &DiffSource) -> &str {
    match source {
        DiffSource::BaseLatestEnd { thread_id, .. }
        | DiffSource::BaseWorktree { thread_id, .. }
        | DiffSource::TurnStartEnd { thread_id, .. }
        | DiffSource::TurnStartWorktree { thread_id, .. }
        | DiffSource::HeadIndex { thread_id }
        | DiffSource::HeadWorktree { thread_id }
        | DiffSource::IndexWorktree { thread_id } => thread_id,
    }
}

fn restore_thread(target: &RestoreTarget) -> &str {
    match target {
        RestoreTarget::Checkpoint { thread_id, .. } | RestoreTarget::Trees { thread_id, .. } => {
            thread_id
        }
    }
}

/// In-progress turns fall back to the live worktree when no end checkpoint
/// exists yet (Q14/D8).
fn fallback_source(source: &DiffSource) -> Option<DiffSource> {
    match source {
        DiffSource::BaseLatestEnd { thread_id, base } => Some(DiffSource::BaseWorktree {
            thread_id: thread_id.clone(),
            base: base.clone(),
        }),
        DiffSource::TurnStartEnd { thread_id, turn } => Some(DiffSource::TurnStartWorktree {
            thread_id: thread_id.clone(),
            turn: *turn,
        }),
        _ => None,
    }
}
