//! Service trait + method routing (transport-agnostic).
//!
//! Module: `tethys-api` — the seam between hosts (`tethys-desktop`,
//! future `tethysd`) and the orchestrator (`tethys-core`).
//! Hosts are thin adapters: they forward Tauri IPC / JSON-RPC calls here.
//! Method names mirror `architecture.md §12.1`.

use futures::stream::Stream;
use std::pin::Pin;
use tethys_schema::composer::{CommandInfo, ExpandedCommand};
use tethys_schema::connection::ConnectionEntry;
use tethys_schema::thread::{
    ContentBlock, CreateThread, EventEnvelope, ThreadId, ThreadSummary, ThreadView,
};
use tethys_schema::{
    CheckpointInfo, CheckpointPhase, CheckpointResult, CommitResult, DiffFileDetail, DiffHunk,
    DiffSource, DiffSummary, HealthStatus, HostInfo, HunkRef, RestoreOutcome, RestorePolicy,
    RestoreTarget, SearchItem, WorktreeInfo, WorktreeSpec,
};

use thiserror::Error;

pub mod mcp;
pub mod skills;

pub use mcp::McpApi;
pub use skills::SkillsApi;

/// Subscription stream returned by `events.subscribe`.
pub type EventStream = Pin<Box<dyn Stream<Item = EventEnvelope> + Send>>;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("internal: {0}")]
    Internal(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("UNIMPLEMENTED: {0}")]
    Unimplemented(&'static str),
    #[error("INDEX_WARMING: {0}")]
    IndexWarming(String),
    #[error("git: {0}")]
    Git(String),
    #[error("invalid config: {0}")]
    InvalidConfig(String),
    #[error("DELETE_BLOCKED: {} uncommitted path(s), {} unpushed commit(s), leased={leased}",
        uncommitted.len(), unpushed.len())]
    DeleteBlocked {
        uncommitted: Vec<String>,
        unpushed: Vec<String>,
        leased: bool,
    },
}

/// Transport-independent core interface. Every host calls this trait;
/// only `tethys-core` implements it.
///
/// Mapping architecture.md §12.1 methods to Rust:
/// - `host`: `info` (host_info), `pair` (host_pair), `health` (health)
/// - `project`: `list`, `add`, `remove`, `settings_get`, `settings_set`, `status`
/// - `agent`: `profiles_list`, `profiles_create`, `profiles_update`, `profiles_delete`,
///   `registry_list`, `registry_install`, `registry_update`, `connections_list`,
///   `connections_restart`, `login`, `logout`, `stderr`, `config_schema`, `config_get`,
///   `config_validate`, `config_plan`, `config_apply`, `config_rollback`
/// - `thread`: `create`, `list`, `get`, `prompt`, `queue_list`, `queue_add`, `queue_remove`,
///   `queue_reorder`, `cancel`, `resume`, `import_sessions`, `fork`, `archive`, `delete`,
///   `set_config_option`, `set_permission_mode`
/// - `events`: `subscribe`, `unsubscribe`, `inbox_subscribe`
/// - `permission`: `respond`, `rules_list`, `rules_set`, `rules_delete`
/// - `git`: `worktree_create`, `worktree_remove`, `worktree_list`, `checkpoint_create`,
///   `checkpoint_restore`, `checkpoint_list`, `diff_summary`, `diff_file`, `stage`,
///   `unstage`, `discard`, `commit`, `merge`, `push`, `pr_create`
/// - `search`: `files` (search_files)
/// - `mcp`: `registry_list`, `registry_set`, `registry_delete`, `effective`,
///   `projection_plan`, `projection_apply`, `projection_rollback`, `import_scan`,
///   `import_apply`, `health` (mcp_health)
/// - `skills`: `list`, `import`, `update_check`, `update_apply`, `trust`, `enable`
/// - `commands`: `list`, `expand`
/// - `terminal`: `list`, `attach`, `write`, `resize`
///
/// Helpers (non-§12.1):
/// - `generate_synthetic_diff` (S0.1 benchmark)
pub trait TethysApi: Send + Sync + McpApi + SkillsApi {
    // === host ===
    fn host_info(&self) -> impl std::future::Future<Output = Result<HostInfo, ApiError>> + Send;
    fn host_pair(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("host.pair")) }
    }
    fn health(&self) -> impl std::future::Future<Output = Result<HealthStatus, ApiError>> + Send;

    // === workspace ===
    fn workspace_list(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.list")) }
    }
    fn workspace_add(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.add")) }
    }
    fn workspace_remove(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.remove")) }
    }
    fn workspace_settings_get(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.settings_get")) }
    }
    fn workspace_settings_set(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.settings_set")) }
    }
    fn workspace_status(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("workspace.status")) }
    }

    // === agent ===
    fn agent_profiles_list(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.profiles_list")) }
    }
    fn agent_profiles_create(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.profiles_create")) }
    }
    fn agent_profiles_update(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.profiles_update")) }
    }
    fn agent_profiles_delete(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.profiles_delete")) }
    }
    fn agent_registry_list(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.registry_list")) }
    }
    fn agent_registry_install(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.registry_install")) }
    }
    fn agent_registry_update(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.registry_update")) }
    }
    fn agent_connections_list(
        &self,
    ) -> impl std::future::Future<Output = Result<Vec<ConnectionEntry>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.connections_list")) }
    }
    fn agent_connections_restart(
        &self,
        _profile_id: String,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.connections_restart")) }
    }
    fn agent_login(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.login")) }
    }
    fn agent_logout(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.logout")) }
    }
    fn agent_stderr(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.stderr")) }
    }
    fn agent_config_schema(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.config_schema")) }
    }
    fn agent_config_get(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.config_get")) }
    }
    fn agent_config_validate(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.config_validate")) }
    }
    fn agent_config_plan(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.config_plan")) }
    }
    fn agent_config_apply(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.config_apply")) }
    }
    fn agent_config_rollback(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("agent.config_rollback")) }
    }

    // === thread ===
    fn thread_create(
        &self,
        _request: CreateThread,
    ) -> impl std::future::Future<Output = Result<ThreadSummary, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.create")) }
    }
    fn thread_list(
        &self,
    ) -> impl std::future::Future<Output = Result<Vec<ThreadSummary>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.list")) }
    }
    fn thread_get(
        &self,
        _id: ThreadId,
    ) -> impl std::future::Future<Output = Result<ThreadView, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.get")) }
    }
    fn thread_prompt(
        &self,
        _id: ThreadId,
        _blocks: Vec<ContentBlock>,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.prompt")) }
    }
    fn thread_queue_list(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.queue_list")) }
    }
    fn thread_queue_add(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.queue_add")) }
    }
    fn thread_queue_remove(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.queue_remove")) }
    }
    fn thread_queue_reorder(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.queue_reorder")) }
    }
    fn thread_cancel(
        &self,
        _id: ThreadId,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.cancel")) }
    }
    fn thread_resume(
        &self,
        _id: ThreadId,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.resume")) }
    }
    fn thread_import_sessions(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.import_sessions")) }
    }
    fn thread_fork(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.fork")) }
    }
    fn thread_archive(
        &self,
        _id: ThreadId,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.archive")) }
    }
    fn thread_delete(
        &self,
        _id: ThreadId,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.delete")) }
    }
    fn thread_set_config_option(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.set_config_option")) }
    }
    fn thread_set_permission_mode(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("thread.set_permission_mode")) }
    }

    // === events ===
    fn events_subscribe(
        &self,
        _thread_id: ThreadId,
        _since_seq: u32,
    ) -> impl std::future::Future<Output = Result<EventStream, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("events.subscribe")) }
    }
    fn events_unsubscribe(
        &self,
        _thread_id: ThreadId,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("events.unsubscribe")) }
    }
    fn events_inbox_subscribe(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("events.inbox_subscribe")) }
    }

    // === permission ===
    fn permission_respond(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("permission.respond")) }
    }
    fn permission_rules_list(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("permission.rules_list")) }
    }
    fn permission_rules_set(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("permission.rules_set")) }
    }
    fn permission_rules_delete(
        &self,
    ) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("permission.rules_delete")) }
    }

    // === git ===

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

    // === search ===
    fn search_files(
        &self,
        workspace_root: String,
        query: String,
        limit: usize,
    ) -> impl std::future::Future<Output = Result<Vec<SearchItem>, ApiError>> + Send;

    // === commands ===
    fn commands_list(
        &self,
        _workspace_root: Option<String>,
    ) -> impl std::future::Future<Output = Result<Vec<CommandInfo>, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("commands.list")) }
    }
    fn commands_expand(
        &self,
        _command: String,
        _args_text: String,
        _workspace_root: Option<String>,
    ) -> impl std::future::Future<Output = Result<ExpandedCommand, ApiError>> + Send {
        async { Err(ApiError::Unimplemented("commands.expand")) }
    }

    // === terminal ===
    fn terminal_list(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("terminal.list")) }
    }
    fn terminal_attach(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("terminal.attach")) }
    }
    fn terminal_write(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("terminal.write")) }
    }
    fn terminal_resize(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("terminal.resize")) }
    }

    // === Benchmark helpers (non-§12.1) ===
    fn generate_synthetic_diff(
        &self,
        line_count: usize,
    ) -> impl std::future::Future<Output = Result<Vec<DiffHunk>, ApiError>> + Send;
}
