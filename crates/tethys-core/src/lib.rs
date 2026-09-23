//! Orchestrator and domain core (implements `tethys-api`).

pub mod agent_profile;
mod api;
pub mod composer;
pub mod env_secrets;
mod git_registry;
pub mod health;
pub mod mcp;
pub mod monitor;
pub mod permission;
mod provider_error;
pub mod skills;
pub mod synthetic;
pub mod thread_queue;
pub mod thread_session;
pub mod workspace;
pub mod workspace_roots;
pub mod workspace_trust;

pub use git_registry::ThreadRuntimeState;
pub use workspace_roots::{
    StaticWorkspaces, StoreWorkspaceRoots, TrustFilteredRoots, WorkspaceRoots,
};
pub use workspace_trust::{StaticTrust, StoreWorkspaceTrust, WorkspaceTrust};

use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tethys_agent_servers::{ConnectionStore, ProviderIntegrationRegistry, StoreOptions};
use tethys_api::ApiError;
use tethys_git::GitError;
use tethys_schema::connection::{AcpProtocol, AgentCompat};
use tethys_schema::{
    CheckpointPhase, DiffSource, RestoreTarget, WorkspaceCapabilities, WorkspaceGitConfig,
};
use tethys_search::{SearchError, SearchIndexManager};
use tethys_sync::secrets::SecretStore;

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
        Self {
            home: home.to_path_buf(),
        }
    }
}

impl From<&PathBuf> for CorePaths {
    fn from(home: &PathBuf) -> Self {
        Self { home: home.clone() }
    }
}

impl From<&str> for CorePaths {
    fn from(home: &str) -> Self {
        Self {
            home: PathBuf::from(home),
        }
    }
}

pub struct Core {
    version: String,
    search: SearchIndexManager,
    git: Mutex<GitRegistry>,
    sessions: Arc<ThreadSessions>,
    store: Option<Arc<tethys_store::EventStore>>,
    workspace_roots: Arc<dyn WorkspaceRoots>,
    trust: Arc<dyn WorkspaceTrust>,
    capability_cache: Mutex<HashMap<String, WorkspaceCapabilities>>,
    registry_source: Option<Arc<dyn tethys_agent_servers::registry::RegistrySource>>,
    monitor: monitor::Monitor,
}

impl Default for Core {
    fn default() -> Self {
        Self::new("0.0.0")
    }
}

impl Core {
    pub fn new(version: impl Into<String>) -> Self {
        let permissions = PermissionRegistry::new();
        let secrets: Arc<dyn SecretStore> = Arc::new(tethys_sync::secrets::KeyringSecrets);
        let store =
            ConnectionStore::new(policy_store_options(permissions.clone(), secrets.clone()));
        let home = dirs::home_dir().unwrap_or_default();
        let sync = crate::thread_session::SyncSource::new(home, secrets);
        let trust: Arc<dyn WorkspaceTrust> = Arc::new(StaticTrust::new());
        let roots: Arc<dyn WorkspaceRoots> = Arc::new(TrustFilteredRoots::new(
            Arc::new(workspace_roots::StaticWorkspaces::new()),
            trust.clone(),
        ));
        let sessions = Arc::new(ThreadSessions::new(store, sync, roots.clone()));
        sessions.set_permissions(permissions);
        Self {
            version: version.into(),
            search: SearchIndexManager::new(),
            git: Mutex::new(GitRegistry::default()),
            sessions,
            store: None,
            workspace_roots: roots,
            trust,
            capability_cache: Mutex::new(HashMap::new()),
            registry_source: None,
            monitor: monitor::Monitor::new(),
        }
    }

    pub fn with_sessions(version: impl Into<String>, sessions: Arc<ThreadSessions>) -> Self {
        let trust: Arc<dyn WorkspaceTrust> = Arc::new(StaticTrust::new());
        let roots: Arc<dyn WorkspaceRoots> = Arc::new(TrustFilteredRoots::new(
            Arc::new(workspace_roots::StaticWorkspaces::new()),
            trust.clone(),
        ));
        Self {
            version: version.into(),
            search: SearchIndexManager::new(),
            git: Mutex::new(GitRegistry::default()),
            sessions,
            store: None,
            workspace_roots: roots,
            trust,
            capability_cache: Mutex::new(HashMap::new()),
            registry_source: None,
            monitor: monitor::Monitor::new(),
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
        let secrets: Arc<dyn SecretStore> = Arc::new(tethys_sync::secrets::KeyringSecrets);
        let sync = crate::thread_session::SyncSource::new(home, secrets.clone());
        let permissions = PermissionRegistry::new();
        let agent_store = ConnectionStore::new(policy_store_options(permissions.clone(), secrets));
        let trust: Arc<dyn WorkspaceTrust> = Arc::new(StoreWorkspaceTrust::new((*store).clone()));
        let workspace_roots: Arc<dyn WorkspaceRoots> = Arc::new(TrustFilteredRoots::new(
            Arc::new(workspace_roots::StoreWorkspaceRoots::new((*store).clone())),
            trust.clone(),
        ));
        let sessions = Arc::new(ThreadSessions::new(
            agent_store,
            sync,
            workspace_roots.clone(),
        ));
        sessions.set_permissions(permissions);
        sessions.set_event_store(Arc::clone(&store));
        if let Ok(rows) = store.agent_profiles().await {
            sessions.hydrate_profiles(&rows);
        }
        sessions.hydrate_threads().await?;
        // Two of the seven re-check triggers (spec §5.2): arm the interval poller
        // and run one check of every enabled Provider now (cold start).
        let health = Arc::clone(sessions.health());
        health.set_interval(health::DEFAULT_INTERVAL_SECS);
        tokio::spawn(async move { health.recheck_all().await });
        let core = Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            search: SearchIndexManager::new(),
            git: Mutex::new(GitRegistry::default()),
            sessions,
            store: Some(store),
            workspace_roots,
            trust,
            capability_cache: Mutex::new(HashMap::new()),
            registry_source: None,
            monitor: monitor::Monitor::new(),
        };
        Ok(core)
    }

    /// Attaches the sync-state store (projection ownership and skill rows).
    pub fn with_store(mut self, store: Arc<tethys_store::EventStore>) -> Self {
        let trust: Arc<dyn WorkspaceTrust> = Arc::new(StoreWorkspaceTrust::new((*store).clone()));
        let roots: Arc<dyn WorkspaceRoots> = Arc::new(TrustFilteredRoots::new(
            Arc::new(workspace_roots::StoreWorkspaceRoots::new((*store).clone())),
            trust.clone(),
        ));
        self.sessions.set_roots(roots.clone());
        self.sessions.set_event_store(Arc::clone(&store));
        self.workspace_roots = roots;
        self.trust = trust;
        self.store = Some(store);
        self
    }

    pub fn with_workspace_roots(mut self, roots: Arc<dyn WorkspaceRoots>) -> Self {
        self.sessions.set_roots(roots.clone());
        self.workspace_roots = roots;
        self
    }

    /// Injects a registry source (tests use a fixture/wiremock source).
    pub fn with_registry_source(
        mut self,
        source: Arc<dyn tethys_agent_servers::registry::RegistrySource>,
    ) -> Self {
        self.registry_source = Some(source);
        self
    }

    /// The configured registry source, or the published endpoint.
    pub(crate) fn registry_source(
        &self,
    ) -> Result<Arc<dyn tethys_agent_servers::registry::RegistrySource>, ApiError> {
        if let Some(source) = &self.registry_source {
            return Ok(Arc::clone(source));
        }
        tethys_agent_servers::registry::HttpRegistrySource::published()
            .map(|source| {
                Arc::new(source) as Arc<dyn tethys_agent_servers::registry::RegistrySource>
            })
            .map_err(|error| ApiError::Internal(error.to_string()))
    }

    pub(crate) fn install_root(&self) -> PathBuf {
        self.sessions.sync().home.join(".tethys").join("agents")
    }

    pub fn workspace_roots(&self) -> &Arc<dyn WorkspaceRoots> {
        &self.workspace_roots
    }

    /// The trust port the workspace catalog grants and revokes through.
    pub fn trust(&self) -> &Arc<dyn WorkspaceTrust> {
        &self.trust
    }

    /// Resolves (and caches) a workspace's capabilities. A cache hit avoids the
    /// git reads a card render would otherwise pay; the entry is invalidated by
    /// [`Self::invalidate_capabilities`] on trust and checkpoint mutations.
    pub(crate) async fn resolve_capabilities(
        &self,
        id: &tethys_schema::sync::WorkspaceId,
    ) -> Result<WorkspaceCapabilities, ApiError> {
        if let Some(cached) = self.capability_cache.lock().get(id.as_str()).cloned() {
            return Ok(cached);
        }
        let root = self.workspace_roots.root(id).await?;
        let resolved = tokio::task::spawn_blocking(move || {
            crate::workspace::capability::resolve_folder(&root)
        })
        .await
        .map_err(|error| ApiError::Internal(format!("capability task failed: {error}")))?;
        self.capability_cache
            .lock()
            .insert(id.as_str().to_string(), resolved.clone());
        Ok(resolved)
    }

    /// Drops the cached capabilities for one workspace (trust grant/revoke, a
    /// checkpoint write, or an in-place `git init`).
    pub fn invalidate_capabilities(&self, id: &str) {
        self.capability_cache.lock().remove(id);
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

    /// The thread's git registration. A thread Core didn't create a worktree
    /// for (one on the workspace's current checkout, or any thread after a
    /// restart) registers on first use from its session's workdir.
    fn registered(&self, thread_id: &str) -> Result<RegisteredWorktree, ApiError> {
        if let Some(registered) = self.git.lock().get(thread_id).cloned() {
            return Ok(registered);
        }
        self.register_checkout(thread_id)
    }

    fn register_checkout(&self, thread_id: &str) -> Result<RegisteredWorktree, ApiError> {
        let workdir = self
            .sessions
            .workdir(&tethys_schema::thread::ThreadId::from(thread_id))
            .map_err(|_| {
                ApiError::Internal(format!("no worktree registered for thread {thread_id}"))
            })?;
        let config = git_registry::load_git_config(&workdir)?;
        let options = tethys_git::GitOptions {
            skip_untracked_binary_bytes: u64::from(config.skip_untracked_binary_bytes),
        };
        let mut registry = self.git.lock();
        let engine = registry.engine(&workdir, options).map_err(map_git_error)?;
        let repo = engine.repo();
        let root = repo.worktree_root.display().to_string();
        let info = tethys_schema::WorktreeInfo {
            thread_id: thread_id.to_string(),
            workspace_root: root.clone(),
            path: root,
            branch: repo.branch.clone(),
            base: "HEAD".to_string(),
            head: repo.head_oid.clone().unwrap_or_default(),
            main_checkout: repo.is_main_worktree,
            warnings: Vec::new(),
            setup: None,
        };
        registry.register(info, engine, config);
        registry.get(thread_id).cloned().ok_or_else(|| {
            ApiError::Internal(format!("no worktree registered for thread {thread_id}"))
        })
    }

    /// Writes the start checkpoint for the turn a prompt is about to open, and
    /// returns what the end checkpoint needs. `None` for a thread without git:
    /// checkpoints are a capability, never a precondition for prompting.
    async fn open_turn_checkpoint(
        &self,
        thread_id: &tethys_schema::thread::ThreadId,
    ) -> Option<(Arc<tethys_git::GitEngine>, String, u32)> {
        let turn = self.sessions.user_turns(thread_id).ok()?.saturating_add(1);
        let registered = self.registered(&thread_id.0).ok()?;
        let engine = registered.engine.clone();
        let thread = thread_id.0.clone();
        let start_engine = engine.clone();
        let start_thread = thread.clone();
        if let Err(error) = blocking(move || {
            start_engine.checkpoint_create(&start_thread, turn, CheckpointPhase::Start)
        })
        .await
        {
            tracing::warn!(thread = %thread, turn, %error, "turn start checkpoint failed");
            return None;
        }
        Some((engine, thread, turn))
    }
}

/// Builds connection options backed by the M1.8 policy engine and the
/// elicitation responder, both sharing one registry.
fn policy_store_options(
    permissions: Arc<PermissionRegistry>,
    secrets: Arc<dyn SecretStore>,
) -> StoreOptions {
    let mut options = StoreOptions::new(
        AcpProtocol::V1,
        Arc::new(PolicyResolver::new(permissions.clone())),
    );
    options.provider_integrations = ProviderIntegrationRegistry::builtins();
    options.client_services = options
        .client_services
        .with_elicitation(Arc::new(ElicitationPolicyResolver::new(permissions)));
    options.env_resolver = Arc::new(env_secrets::KeychainEnv::new(secrets));
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
