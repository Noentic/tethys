//! Service trait + method routing (transport-agnostic).
//!
//! Module: `tethys-api` — the seam between hosts (`tethys-desktop`,
//! future `tethysd`) and the orchestrator (`tethys-core`).
//! Hosts are thin adapters: they forward Tauri IPC / JSON-RPC calls here.
//! Method names mirror `architecture.md §12.1`.
//!
//! Each namespace is its own sub-trait file (the `McpApi` / `SkillsApi`
//! precedent), and [`TethysApi`] is the aggregate supertrait bound that hosts
//! bind to. A chunk adding a namespace method edits only that namespace file.

use futures::stream::Stream;
use std::pin::Pin;
use tethys_schema::thread::EventEnvelope;

use thiserror::Error;

pub mod agent;
pub mod bench;
pub mod commands;
pub mod events;
pub mod git;
pub mod host;
pub mod mcp;
pub mod permission;
pub mod search;
pub mod skills;
pub mod terminal;
pub mod thread;
pub mod workspace;

pub use agent::AgentApi;
pub use bench::BenchApi;
pub use commands::CommandsApi;
pub use events::EventsApi;
pub use git::GitApi;
pub use host::HostApi;
pub use mcp::McpApi;
pub use permission::PermissionApi;
pub use search::SearchApi;
pub use skills::SkillsApi;
pub use terminal::TerminalApi;
pub use thread::ThreadApi;
pub use workspace::WorkspaceApi;

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
    #[error("CONFLICT: {0}")]
    Conflict(String),
    #[error("CAPABILITIES_NOT_NEGOTIATED: connection has not negotiated capabilities yet")]
    CapabilitiesNotNegotiated,
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
/// - `workspace`: `list`, `add`, `remove`, `settings_get`, `settings_set`, `status`,
///   `capabilities`
/// - `agent`: `profiles_list`, `profiles_create`, `profiles_update`, `profiles_delete`,
///   `registry_list`, `registry_install`, `registry_update`, `connections_list`,
///   `connections_restart`, `login`, `logout`, `stderr`, `config_schema`, `config_get`,
///   `config_validate`, `config_plan`, `config_apply`, `config_rollback`
/// - `thread`: `create`, `list`, `get`, `prompt`, `queue_list`, `queue_add`, `queue_remove`,
///   `queue_reorder`, `cancel`, `cancel_state`, `resume`, `import_sessions`, `fork`, `archive`,
///   `delete`, `set_config_option`, `set_permission_mode`
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
///
/// The aggregate is a marker trait: its methods live on the sub-traits, and any
/// `T` that implements every sub-trait satisfies `TethysApi` through the blanket
/// impl below.
pub trait TethysApi:
    Send
    + Sync
    + HostApi
    + WorkspaceApi
    + AgentApi
    + ThreadApi
    + EventsApi
    + PermissionApi
    + GitApi
    + SearchApi
    + CommandsApi
    + TerminalApi
    + BenchApi
    + McpApi
    + SkillsApi
{
}

impl<T> TethysApi for T where
    T: Send
        + Sync
        + HostApi
        + WorkspaceApi
        + AgentApi
        + ThreadApi
        + EventsApi
        + PermissionApi
        + GitApi
        + SearchApi
        + CommandsApi
        + TerminalApi
        + BenchApi
        + McpApi
        + SkillsApi
{
}
