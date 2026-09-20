//! Orchestrator and domain core (implements `tethys-api`).

mod api;
pub mod composer;
mod git_registry;
pub mod mcp;
pub mod permission;
pub mod skills;
pub mod synthetic;
pub mod thread_session;
pub mod workspace_roots;

pub use git_registry::ThreadRuntimeState;
pub use workspace_roots::{StaticWorkspaces, StoreWorkspaceRoots, WorkspaceRoots};

use parking_lot::Mutex;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tethys_agent_servers::{ConnectionStore, StoreOptions};
use tethys_api::ApiError;
use tethys_git::GitError;
use tethys_schema::connection::{AcpProtocol, AgentCompat};
use tethys_schema::{CheckpointPhase, DiffSource, RestoreTarget, WorkspaceGitConfig};
use tethys_search::{SearchError, SearchIndexManager};

use crate::composer::SkillCandidate;
use crate::permission::{ElicitationPolicyResolver, PermissionRegistry, PolicyResolver};
use crate::thread_session::ThreadSessions;
use git_registry::{GitRegistry, RegisteredWorktree};

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
        let permissions = PermissionRegistry::new();
        let store = ConnectionStore::new(policy_store_options(permissions.clone()));
        let home = dirs::home_dir().unwrap_or_default();
        let sync =
            crate::thread_session::SyncSource::new(home, Arc::new(tethys_sync::KeyringSecrets));
        let sessions = Arc::new(ThreadSessions::new(
            store,
            sync,
            Arc::new(workspace_roots::StaticWorkspaces::new()),
        ));
        sessions.set_permissions(permissions);
        Self::with_sessions(version, sessions)
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
        let permissions = PermissionRegistry::new();
        let agent_store = ConnectionStore::new(policy_store_options(permissions.clone()));
        let workspace_roots = Arc::new(workspace_roots::StoreWorkspaceRoots::new((*store).clone()));
        let sessions = Arc::new(ThreadSessions::new(agent_store, sync, workspace_roots.clone()));
        sessions.set_permissions(permissions);
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

/// Builds connection options backed by the M1.8 policy engine and the
/// elicitation responder, both sharing one registry.
fn policy_store_options(permissions: Arc<PermissionRegistry>) -> StoreOptions {
    let mut options = StoreOptions::new(
        AcpProtocol::V1,
        Arc::new(PolicyResolver::new(permissions.clone())),
    );
    options.elicitation_resolver = Arc::new(ElicitationPolicyResolver::new(permissions));
    options
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

/// Whether a caller-supplied worktree path is inside the workspace root or the
/// configured/default worktrees directory.
fn worktree_path_allowed(
    root: &Path,
    sync_home: &Path,
    config: &WorkspaceGitConfig,
    candidate: &Path,
) -> bool {
    let mut allowed = vec![normalize_path(root)];
    match config
        .worktrees_dir
        .as_deref()
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
    {
        Some(dir) => {
            let dir = Path::new(dir);
            let dir = if dir.is_absolute() {
                dir.to_path_buf()
            } else {
                root.join(dir)
            };
            allowed.push(normalize_path(&dir));
        }
        None => allowed.push(normalize_path(&sync_home.join("worktrees"))),
    }

    let candidate = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        root.join(candidate)
    };
    let candidate = normalize_path(&candidate);
    allowed.iter().any(|base| candidate.starts_with(base))
}

/// Lexically resolves a path, canonicalizing the deepest existing ancestor so
/// symlinks cannot smuggle an out-of-jail path past the check. The leaf may
/// not exist yet (the worktree is created after validation).
pub(crate) fn normalize_path(path: &Path) -> PathBuf {
    if let Ok(canonical) = path.canonicalize() {
        return canonical;
    }
    match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) => normalize_path(parent).join(name),
        _ => path.to_path_buf(),
    }
}
