//! Tauri commands — thin adapters over `tethys-api::TethysApi`.
//!
//! Rules (tauri-v2 skill): owned types only in async commands, `Result`
//! returns, no domain state here (state lives in `tethys-core`).

use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::State;
use tethys_api::TethysApi;
use tethys_core::Core;
use tethys_schema::{
    BenchmarkConfig, BenchmarkResult, DiffHunk, HealthStatus, HostInfo, SearchItem, StreamChunk,
};

pub type CoreState = Arc<Core>;

/// Helper macro for nullary stub commands returning Result<(), String>
macro_rules! stub_cmd {
    ($name:ident) => {
        #[tauri::command]
        #[specta::specta]
        pub async fn $name(state: State<'_, CoreState>) -> Result<(), String> {
            state.$name().await.map_err(|e| e.to_string())
        }
    };
}

// === host ===

/// `host.info` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn host_info(state: State<'_, CoreState>) -> Result<HostInfo, String> {
    state.host_info().await.map_err(|e| e.to_string())
}

stub_cmd!(host_pair);

/// `host.health` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn health(state: State<'_, CoreState>) -> Result<HealthStatus, String> {
    state.health().await.map_err(|e| e.to_string())
}

// === project ===
stub_cmd!(project_list);
stub_cmd!(project_add);
stub_cmd!(project_remove);
stub_cmd!(project_settings_get);
stub_cmd!(project_settings_set);
stub_cmd!(project_status);

// === agent ===
stub_cmd!(agent_profiles_list);
stub_cmd!(agent_profiles_create);
stub_cmd!(agent_profiles_update);
stub_cmd!(agent_profiles_delete);
stub_cmd!(agent_registry_list);
stub_cmd!(agent_registry_install);
stub_cmd!(agent_registry_update);
stub_cmd!(agent_connections_list);
stub_cmd!(agent_connections_restart);
stub_cmd!(agent_login);
stub_cmd!(agent_logout);
stub_cmd!(agent_stderr);
stub_cmd!(agent_config_schema);
stub_cmd!(agent_config_get);
stub_cmd!(agent_config_validate);
stub_cmd!(agent_config_plan);
stub_cmd!(agent_config_apply);
stub_cmd!(agent_config_rollback);

// === thread ===
stub_cmd!(thread_create);
stub_cmd!(thread_list);
stub_cmd!(thread_get);
stub_cmd!(thread_prompt);
stub_cmd!(thread_queue_list);
stub_cmd!(thread_queue_add);
stub_cmd!(thread_queue_remove);
stub_cmd!(thread_queue_reorder);
stub_cmd!(thread_cancel);
stub_cmd!(thread_resume);
stub_cmd!(thread_import_sessions);
stub_cmd!(thread_fork);
stub_cmd!(thread_archive);
stub_cmd!(thread_delete);
stub_cmd!(thread_set_config_option);
stub_cmd!(thread_set_permission_mode);

// === events ===
stub_cmd!(events_subscribe);
stub_cmd!(events_unsubscribe);
stub_cmd!(events_inbox_subscribe);

// === permission ===
stub_cmd!(permission_respond);
stub_cmd!(permission_rules_list);
stub_cmd!(permission_rules_set);
stub_cmd!(permission_rules_delete);

// === git ===
stub_cmd!(git_worktree_create);
stub_cmd!(git_worktree_remove);
stub_cmd!(git_worktree_list);
stub_cmd!(git_checkpoint_create);
stub_cmd!(git_checkpoint_restore);
stub_cmd!(git_checkpoint_list);
stub_cmd!(git_diff_summary);
stub_cmd!(git_diff_file);
stub_cmd!(git_stage);
stub_cmd!(git_unstage);
stub_cmd!(git_discard);
stub_cmd!(git_commit);
stub_cmd!(git_merge);
stub_cmd!(git_push);
stub_cmd!(git_pr_create);

// === search ===

/// `search.files` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn search_files(
    state: State<'_, CoreState>,
    query: String,
    limit: usize,
) -> Result<Vec<SearchItem>, String> {
    state.search_files(query, limit).await.map_err(|e| e.to_string())
}

// === mcp ===
stub_cmd!(mcp_registry_list);
stub_cmd!(mcp_registry_set);
stub_cmd!(mcp_registry_delete);
stub_cmd!(mcp_effective);
stub_cmd!(mcp_projection_plan);
stub_cmd!(mcp_projection_apply);
stub_cmd!(mcp_projection_rollback);
stub_cmd!(mcp_import_scan);
stub_cmd!(mcp_import_apply);
stub_cmd!(mcp_health);

// === skills ===
stub_cmd!(skills_list);
stub_cmd!(skills_import);
stub_cmd!(skills_update_check);
stub_cmd!(skills_update_apply);
stub_cmd!(skills_trust);
stub_cmd!(skills_enable);

// === commands ===
stub_cmd!(commands_list);
stub_cmd!(commands_expand);

// === terminal ===
stub_cmd!(terminal_list);
stub_cmd!(terminal_attach);
stub_cmd!(terminal_write);
stub_cmd!(terminal_resize);

// === Benchmark helpers (non-§12.1) ===

/// `git.diff.synthetic` — S0.1 diff benchmark generator.
#[tauri::command]
#[specta::specta]
pub async fn generate_synthetic_diff(
    state: State<'_, CoreState>,
    line_count: usize,
) -> Result<Vec<DiffHunk>, String> {
    state
        .generate_synthetic_diff(line_count)
        .await
        .map_err(|e| e.to_string())
}

/// `bench.stream` — S0.1 IPC channel streaming.
#[tauri::command]
pub async fn run_stream_benchmark(
    config: BenchmarkConfig,
    on_chunk: Channel<StreamChunk>,
) -> Result<BenchmarkResult, String> {
    let start = std::time::Instant::now();
    let total_per_stream = config.total_messages / config.streams.max(1);
    let mut handles = Vec::new();

    for stream_id in 0..config.streams {
        let channel = on_chunk.clone();
        let payload_size = config.message_size_bytes as usize;
        let chunks = tethys_core::synthetic::generate_stream_chunks(
            stream_id,
            total_per_stream,
            payload_size,
        );

        handles.push(tokio::spawn(async move {
            for chunk in chunks {
                let _ = channel.send(chunk);
            }
        }));
    }

    for h in handles {
        let _ = h.await;
    }

    let elapsed = start.elapsed();
    let elapsed_ms = elapsed.as_secs_f64() * 1000.0;
    let msgs_per_sec = (config.total_messages as f64) / elapsed.as_secs_f64().max(0.001);

    Ok(BenchmarkResult {
        total_messages: config.total_messages,
        elapsed_ms,
        messages_per_sec: msgs_per_sec,
        p95_latency_ms: elapsed_ms / (config.total_messages as f64).max(1.0),
    })
}
