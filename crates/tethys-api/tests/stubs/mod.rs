//! Shared `MinimalApi` fixture and helpers for the per-namespace stub tests.
//!
//! `MinimalApi` implements only the methods that have no default body —
//! `host_info`, `health`, `search_files` and `generate_synthetic_diff` — plus
//! empty impls for the default-bodied sub-traits, proving that a type with the
//! minimum surface still satisfies `TethysApi` through its blanket impl.

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

use tethys_api::{
    AgentApi, ApiError, BenchApi, CommandsApi, EventsApi, GitApi, HostApi, McpApi, PermissionApi,
    SearchApi, SkillsApi, TerminalApi, ThreadApi, WorkspaceApi,
};
use tethys_schema::sync::WorkspaceId;
use tethys_schema::thread::CreateThread;
use tethys_schema::{DiffHunk, HealthStatus, HostInfo, SearchItem};

/// Asserts an awaited stub call returned `Unimplemented` with `message`.
pub(crate) fn assert_unimplemented<T: std::fmt::Debug>(
    message: &str,
    result: Result<T, ApiError>,
) {
    match result {
        Err(ApiError::Unimplemented(m)) => assert_eq!(m, message),
        other => panic!("expected Unimplemented({message}), got {other:?}"),
    }
}

pub struct MinimalApi;

impl McpApi for MinimalApi {}
impl SkillsApi for MinimalApi {}
impl WorkspaceApi for MinimalApi {}
impl AgentApi for MinimalApi {}
impl ThreadApi for MinimalApi {}
impl EventsApi for MinimalApi {}
impl PermissionApi for MinimalApi {}
impl GitApi for MinimalApi {}
impl CommandsApi for MinimalApi {}
impl TerminalApi for MinimalApi {}

impl HostApi for MinimalApi {
    async fn host_info(&self) -> Result<HostInfo, ApiError> {
        Ok(HostInfo {
            version: "0.0.0".into(),
            platform: "test".into(),
        })
    }

    async fn health(&self) -> Result<HealthStatus, ApiError> {
        Ok(HealthStatus {
            ok: true,
            core_version: "0.0.0".into(),
        })
    }
}

impl SearchApi for MinimalApi {
    async fn search_files(
        &self,
        _workspace_id: WorkspaceId,
        _query: String,
        _limit: usize,
    ) -> Result<Vec<SearchItem>, ApiError> {
        Ok(vec![])
    }
}

impl BenchApi for MinimalApi {
    async fn generate_synthetic_diff(&self, _line_count: usize) -> Result<Vec<DiffHunk>, ApiError> {
        Ok(vec![])
    }
}

/// Compile-time guard: `MinimalApi` satisfies `TethysApi` via the blanket impl.
const _: fn() = || {
    fn requires_tethys<T: tethys_api::TethysApi>() {}
    requires_tethys::<MinimalApi>();
};

/// A helper so the fixture's `CreateThread` construction is shared.
pub(crate) fn sample_create_thread() -> CreateThread {
    CreateThread {
        workspace_id: "p1".into(),
        agent_profile_id: "a1".into(),
        workdir: "/tmp".into(),
    }
}

/// A helper so the fixture's `TrustGrant` construction is shared.
pub(crate) fn sample_trust_grant() -> tethys_schema::catalog::TrustGrant {
    tethys_schema::catalog::TrustGrant {
        path: "/tmp".into(),
        permission_mode: tethys_schema::workspace::PermissionMode::Supervised,
        scope: tethys_schema::catalog::TrustScope::Folder,
        init_git: false,
    }
}
