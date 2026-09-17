use tethys_api::{ApiError, TethysApi};
use tethys_schema::{DiffHunk, HealthStatus, HostInfo, SearchItem};

struct MinimalApi;

impl TethysApi for MinimalApi {
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

    async fn search_files(&self, _query: String, _limit: usize) -> Result<Vec<SearchItem>, ApiError> {
        Ok(vec![])
    }

    async fn generate_synthetic_diff(&self, _line_count: usize) -> Result<Vec<DiffHunk>, ApiError> {
        Ok(vec![])
    }
}

#[tokio::test]
async fn test_stub_defaults_return_unimplemented() {
    let api = MinimalApi;

    // Check representative stubs across different namespaces
    match api.project_list().await {
        Err(ApiError::Unimplemented(m)) => assert_eq!(m, "project.list"),
        other => panic!("expected Unimplemented, got {other:?}"),
    }

    match api.agent_profiles_list().await {
        Err(ApiError::Unimplemented(m)) => assert_eq!(m, "agent.profiles_list"),
        other => panic!("expected Unimplemented, got {other:?}"),
    }

    match api.thread_create().await {
        Err(ApiError::Unimplemented(m)) => assert_eq!(m, "thread.create"),
        other => panic!("expected Unimplemented, got {other:?}"),
    }

    match api.git_worktree_create().await {
        Err(ApiError::Unimplemented(m)) => assert_eq!(m, "git.worktree_create"),
        other => panic!("expected Unimplemented, got {other:?}"),
    }

    match api.mcp_registry_list().await {
        Err(ApiError::Unimplemented(m)) => assert_eq!(m, "mcp.registry_list"),
        other => panic!("expected Unimplemented, got {other:?}"),
    }

    match api.terminal_write().await {
        Err(ApiError::Unimplemented(m)) => assert_eq!(m, "terminal.write"),
        other => panic!("expected Unimplemented, got {other:?}"),
    }
}
