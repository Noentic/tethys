//! Tauri commands — thin adapters over `tethys-api::TethysApi`.
//!
//! Rules (tauri-v2 skill): owned types only in async commands, `Result`
//! returns, no domain state here (state lives in `tethys-core`).

use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::State;
use tethys_api::{McpApi, SkillsApi, TethysApi};
use tethys_core::Core;
use tethys_schema::composer::{CommandInfo, ExpandedCommand};
use tethys_schema::connection::ConnectionEntry;
use tethys_schema::sync::{
    Applied, AttachmentGrid, ImportCandidate, ImportScan, ProjectionPlan, RegistryEntry,
    RegistryEntryView, Scope, SkillImportSource, SkillInfo, SkillUpdateApplied, SkillUpdateCheck,
    SkillUpdatePlan, TargetId, VerifyStatus, WorkspaceId,
};
use tethys_schema::thread::{
    ContentBlock, CreateThread, EventEnvelope, ThreadId, ThreadSummary, ThreadView,
};
use tethys_schema::{
    BenchmarkConfig, BenchmarkResult, CheckpointInfo, CheckpointPhase, CheckpointResult,
    CommitResult, DiffFileDetail, DiffHunk, DiffSource, DiffSummary, HealthStatus, HostInfo,
    HunkRef, RestoreOutcome, RestorePolicy, RestoreTarget, SearchItem, StreamChunk,
    WorkspaceCapabilities, WorktreeInfo, WorktreeSpec,
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

// === workspace ===
stub_cmd!(workspace_list);
stub_cmd!(workspace_add);
stub_cmd!(workspace_remove);
stub_cmd!(workspace_settings_get);
stub_cmd!(workspace_settings_set);
stub_cmd!(workspace_status);

/// `workspace.capabilities` — resolved capability set for one workspace (§10.6).
#[tauri::command]
#[specta::specta]
pub async fn workspace_capabilities(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
) -> Result<WorkspaceCapabilities, String> {
    state
        .workspace_capabilities(workspace_id)
        .await
        .map_err(|e| e.to_string())
}

// === agent ===
stub_cmd!(agent_profiles_list);
stub_cmd!(agent_profiles_create);
stub_cmd!(agent_profiles_update);
stub_cmd!(agent_profiles_delete);
stub_cmd!(agent_registry_list);
stub_cmd!(agent_registry_install);
stub_cmd!(agent_registry_update);
/// `agent.connections.list` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn agent_connections_list(
    state: State<'_, CoreState>,
) -> Result<Vec<ConnectionEntry>, String> {
    state
        .agent_connections_list()
        .await
        .map_err(|e| e.to_string())
}

/// `agent.connections.restart` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn agent_connections_restart(
    state: State<'_, CoreState>,
    profile_id: String,
) -> Result<(), String> {
    state
        .agent_connections_restart(profile_id)
        .await
        .map_err(|e| e.to_string())
}
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

/// `thread.create` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_create(
    state: State<'_, CoreState>,
    request: CreateThread,
) -> Result<ThreadSummary, String> {
    state
        .thread_create(request)
        .await
        .map_err(|e| e.to_string())
}

/// `thread.list` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_list(state: State<'_, CoreState>) -> Result<Vec<ThreadSummary>, String> {
    state.thread_list().await.map_err(|e| e.to_string())
}

/// `thread.get` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_get(state: State<'_, CoreState>, id: ThreadId) -> Result<ThreadView, String> {
    state.thread_get(id).await.map_err(|e| e.to_string())
}

/// `thread.prompt` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_prompt(
    state: State<'_, CoreState>,
    id: ThreadId,
    blocks: Vec<ContentBlock>,
) -> Result<(), String> {
    state
        .thread_prompt(id, blocks)
        .await
        .map_err(|e| e.to_string())
}
stub_cmd!(thread_queue_list);
stub_cmd!(thread_queue_add);
stub_cmd!(thread_queue_remove);
stub_cmd!(thread_queue_reorder);
/// `thread.cancel` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_cancel(state: State<'_, CoreState>, id: ThreadId) -> Result<(), String> {
    state.thread_cancel(id).await.map_err(|e| e.to_string())
}

/// `thread.resume` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_resume(state: State<'_, CoreState>, id: ThreadId) -> Result<(), String> {
    state.thread_resume(id).await.map_err(|e| e.to_string())
}
stub_cmd!(thread_import_sessions);
stub_cmd!(thread_fork);
/// `thread.archive` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_archive(state: State<'_, CoreState>, id: ThreadId) -> Result<(), String> {
    state.thread_archive(id).await.map_err(|e| e.to_string())
}

/// `thread.delete` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn thread_delete(state: State<'_, CoreState>, id: ThreadId) -> Result<(), String> {
    state.thread_delete(id).await.map_err(|e| e.to_string())
}
stub_cmd!(thread_set_config_option);
stub_cmd!(thread_set_permission_mode);

// === events ===

/// `events.subscribe` — streams `EventEnvelope`s over a Channel until the
/// thread is deleted (`architecture.md §12.1`).
#[tauri::command]
pub async fn events_subscribe(
    state: State<'_, CoreState>,
    thread_id: ThreadId,
    since_seq: u32,
    on_event: Channel<EventEnvelope>,
) -> Result<(), String> {
    use futures::StreamExt;
    let mut stream = state
        .events_subscribe(thread_id, since_seq)
        .await
        .map_err(|e| e.to_string())?;
    while let Some(event) = stream.next().await {
        if on_event.send(event).is_err() {
            break;
        }
    }
    Ok(())
}

/// `events.unsubscribe` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn events_unsubscribe(
    state: State<'_, CoreState>,
    thread_id: ThreadId,
) -> Result<(), String> {
    state
        .events_unsubscribe(thread_id)
        .await
        .map_err(|e| e.to_string())
}
stub_cmd!(events_inbox_subscribe);

// === permission ===
stub_cmd!(permission_respond);
stub_cmd!(permission_rules_list);
stub_cmd!(permission_rules_set);
stub_cmd!(permission_rules_delete);

// === git ===

/// `git.worktree_create` — materialize or register a thread worktree.
#[tauri::command]
#[specta::specta]
pub async fn git_worktree_create(
    state: State<'_, CoreState>,
    spec: WorktreeSpec,
) -> Result<WorktreeInfo, String> {
    state
        .git_worktree_create(spec)
        .await
        .map_err(|e| e.to_string())
}

/// `git.worktree_remove` — delete guard runs in the engine.
#[tauri::command]
#[specta::specta]
pub async fn git_worktree_remove(
    state: State<'_, CoreState>,
    thread_id: String,
    force: bool,
    leased: bool,
) -> Result<(), String> {
    state
        .git_worktree_remove(thread_id, force, leased)
        .await
        .map_err(|e| e.to_string())
}

/// `git.worktree_list` — registered thread worktrees.
#[tauri::command]
#[specta::specta]
pub async fn git_worktree_list(state: State<'_, CoreState>) -> Result<Vec<WorktreeInfo>, String> {
    state.git_worktree_list().await.map_err(|e| e.to_string())
}

/// `git.worktree_archive` — keep the worktree, archive turn refs.
#[tauri::command]
#[specta::specta]
pub async fn git_worktree_archive(
    state: State<'_, CoreState>,
    thread_id: String,
) -> Result<(), String> {
    state
        .git_worktree_archive(thread_id)
        .await
        .map_err(|e| e.to_string())
}

/// `git.checkpoint_create` — start/end turn checkpoint.
#[tauri::command]
#[specta::specta]
pub async fn git_checkpoint_create(
    state: State<'_, CoreState>,
    thread_id: String,
    turn: u32,
    phase: CheckpointPhase,
) -> Result<CheckpointResult, String> {
    state
        .git_checkpoint_create(thread_id, turn, phase)
        .await
        .map_err(|e| e.to_string())
}

/// `git.checkpoint_restore` — full-state restore returning the undo capture.
#[tauri::command]
#[specta::specta]
pub async fn git_checkpoint_restore(
    state: State<'_, CoreState>,
    target: RestoreTarget,
    policy: Option<RestorePolicy>,
) -> Result<RestoreOutcome, String> {
    state
        .git_checkpoint_restore(target, policy)
        .await
        .map_err(|e| e.to_string())
}

/// `git.checkpoint_list` — turn checkpoints for a thread.
#[tauri::command]
#[specta::specta]
pub async fn git_checkpoint_list(
    state: State<'_, CoreState>,
    thread_id: String,
) -> Result<Vec<CheckpointInfo>, String> {
    state
        .git_checkpoint_list(thread_id)
        .await
        .map_err(|e| e.to_string())
}

/// `git.diff_summary` — files changed for an anchor pair.
#[tauri::command]
#[specta::specta]
pub async fn git_diff_summary(
    state: State<'_, CoreState>,
    source: DiffSource,
) -> Result<DiffSummary, String> {
    state
        .git_diff_summary(source)
        .await
        .map_err(|e| e.to_string())
}

/// `git.diff_file` — hunk detail for one path.
#[tauri::command]
#[specta::specta]
pub async fn git_diff_file(
    state: State<'_, CoreState>,
    source: DiffSource,
    path: String,
) -> Result<DiffFileDetail, String> {
    state
        .git_diff_file(source, path)
        .await
        .map_err(|e| e.to_string())
}

/// `git.stage` — stage paths in the thread's index.
#[tauri::command]
#[specta::specta]
pub async fn git_stage(
    state: State<'_, CoreState>,
    thread_id: String,
    paths: Vec<String>,
) -> Result<(), String> {
    state
        .git_stage(thread_id, paths)
        .await
        .map_err(|e| e.to_string())
}

/// `git.unstage` — unstage paths from the thread's index.
#[tauri::command]
#[specta::specta]
pub async fn git_unstage(
    state: State<'_, CoreState>,
    thread_id: String,
    paths: Vec<String>,
) -> Result<(), String> {
    state
        .git_unstage(thread_id, paths)
        .await
        .map_err(|e| e.to_string())
}

/// `git.discard` — discard hunks (or all live changes).
#[tauri::command]
#[specta::specta]
pub async fn git_discard(
    state: State<'_, CoreState>,
    thread_id: String,
    source: DiffSource,
    hunks: Option<Vec<HunkRef>>,
) -> Result<(), String> {
    state
        .git_discard(thread_id, source, hunks)
        .await
        .map_err(|e| e.to_string())
}

/// `git.commit` — commit staged work on the thread branch.
#[tauri::command]
#[specta::specta]
pub async fn git_commit(
    state: State<'_, CoreState>,
    thread_id: String,
    message: String,
) -> Result<CommitResult, String> {
    state
        .git_commit(thread_id, message)
        .await
        .map_err(|e| e.to_string())
}

// merge / push / pr_create arrive with M2.6.
stub_cmd!(git_merge);
stub_cmd!(git_push);
stub_cmd!(git_pr_create);

// === search ===

/// `search.files` — see `architecture.md §12.1`.
#[tauri::command]
#[specta::specta]
pub async fn search_files(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    query: String,
    limit: usize,
) -> Result<Vec<SearchItem>, String> {
    state
        .search_files(workspace_id, query, limit)
        .await
        .map_err(|e| e.to_string())
}

// === mcp ===

/// `mcp.registry.list` — registry entries from global and workspace scopes.
#[tauri::command]
#[specta::specta]
pub async fn mcp_registry_list(
    state: State<'_, CoreState>,
    workspace_id: Option<WorkspaceId>,
) -> Result<Vec<RegistryEntryView>, String> {
    state
        .mcp_registry_list(workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.registry.set` — upsert one registry entry.
#[tauri::command]
#[specta::specta]
pub async fn mcp_registry_set(
    state: State<'_, CoreState>,
    name: String,
    entry: RegistryEntry,
    scope: Scope,
    workspace_id: Option<WorkspaceId>,
) -> Result<(), String> {
    state
        .mcp_registry_set(name, entry, scope, workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.registry.delete` — remove one registry entry.
#[tauri::command]
#[specta::specta]
pub async fn mcp_registry_delete(
    state: State<'_, CoreState>,
    name: String,
    scope: Scope,
    workspace_id: Option<WorkspaceId>,
) -> Result<bool, String> {
    state
        .mcp_registry_delete(name, scope, workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.effective` — merged entries visible to one provider.
#[tauri::command]
#[specta::specta]
pub async fn mcp_effective(
    state: State<'_, CoreState>,
    provider_id: Option<String>,
    workspace_id: Option<WorkspaceId>,
) -> Result<Vec<RegistryEntryView>, String> {
    state
        .mcp_effective(provider_id, workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.attachments` — servers × providers attachment grid.
#[tauri::command]
#[specta::specta]
pub async fn mcp_attachments(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
) -> Result<AttachmentGrid, String> {
    state
        .mcp_attachments(workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.projection.plan` — preview a vendor config write.
#[tauri::command]
#[specta::specta]
pub async fn mcp_projection_plan(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    target: TargetId,
    scope: Scope,
) -> Result<ProjectionPlan, String> {
    state
        .mcp_projection_plan(workspace_id, target, scope)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.projection.apply` — write a plan after re-checking the file.
#[tauri::command]
#[specta::specta]
pub async fn mcp_projection_apply(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    target: TargetId,
    scope: Scope,
    plan: ProjectionPlan,
) -> Result<Applied, String> {
    state
        .mcp_projection_apply(workspace_id, target, scope, plan)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.projection.rollback` — restore the newest backup.
#[tauri::command]
#[specta::specta]
pub async fn mcp_projection_rollback(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    target: TargetId,
    scope: Scope,
) -> Result<(), String> {
    state
        .mcp_projection_rollback(workspace_id, target, scope)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.projection.verify` — compare a projected file against its manifest.
#[tauri::command]
#[specta::specta]
pub async fn mcp_projection_verify(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    target: TargetId,
    scope: Scope,
) -> Result<VerifyStatus, String> {
    state
        .mcp_projection_verify(workspace_id, target, scope)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.import.scan` — read-only detection across installed tools.
#[tauri::command]
#[specta::specta]
pub async fn mcp_import_scan(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
) -> Result<ImportScan, String> {
    state
        .mcp_import_scan(workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `mcp.import.apply` — write the chosen candidates into the registry.
#[tauri::command]
#[specta::specta]
pub async fn mcp_import_apply(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    candidates: Vec<ImportCandidate>,
    scope: Scope,
) -> Result<Vec<String>, String> {
    state
        .mcp_import_apply(workspace_id, candidates, scope)
        .await
        .map_err(|e| e.to_string())
}

// mcp.health arrives with M2.4.
stub_cmd!(mcp_health);

// === skills ===

/// `skills.list` — canonical home scan with trust facts.
#[tauri::command]
#[specta::specta]
pub async fn skills_list(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
) -> Result<Vec<SkillInfo>, String> {
    state
        .skills_list(workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `skills.import` — folder, archive, or GitHub import.
#[tauri::command]
#[specta::specta]
pub async fn skills_import(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    scope: Scope,
    source: SkillImportSource,
) -> Result<SkillInfo, String> {
    state
        .skills_import(workspace_id, scope, source)
        .await
        .map_err(|e| e.to_string())
}

/// `skills.update.check` — cheap upstream SHA comparison.
#[tauri::command]
#[specta::specta]
pub async fn skills_update_check(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    scope: Scope,
    name: String,
) -> Result<SkillUpdateCheck, String> {
    state
        .skills_update_check(workspace_id, scope, name)
        .await
        .map_err(|e| e.to_string())
}

/// `skills.update.plan` — download and diff without writing.
#[tauri::command]
#[specta::specta]
pub async fn skills_update_plan(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    scope: Scope,
    name: String,
) -> Result<SkillUpdatePlan, String> {
    state
        .skills_update_plan(workspace_id, scope, name)
        .await
        .map_err(|e| e.to_string())
}

/// `skills.update.apply` — swap atomically and clear trust.
#[tauri::command]
#[specta::specta]
pub async fn skills_update_apply(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    scope: Scope,
    name: String,
) -> Result<SkillUpdateApplied, String> {
    state
        .skills_update_apply(workspace_id, scope, name)
        .await
        .map_err(|e| e.to_string())
}

/// `skills.trust` — bind trust to the current content hash.
#[tauri::command]
#[specta::specta]
pub async fn skills_trust(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    scope: Scope,
    name: String,
) -> Result<SkillInfo, String> {
    state
        .skills_trust(workspace_id, scope, name)
        .await
        .map_err(|e| e.to_string())
}

/// `skills.enable` — toggle without deleting.
#[tauri::command]
#[specta::specta]
pub async fn skills_enable(
    state: State<'_, CoreState>,
    workspace_id: WorkspaceId,
    scope: Scope,
    name: String,
    enabled: bool,
) -> Result<SkillInfo, String> {
    state
        .skills_enable(workspace_id, scope, name, enabled)
        .await
        .map_err(|e| e.to_string())
}

// === commands ===

/// `commands.list` — discovered `/` Tethys commands (CMP-01).
#[tauri::command]
#[specta::specta]
pub async fn commands_list(
    state: State<'_, CoreState>,
    workspace_id: Option<WorkspaceId>,
) -> Result<Vec<CommandInfo>, String> {
    state
        .commands_list(workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// `commands.expand` — expands a command body with args and references.
#[tauri::command]
#[specta::specta]
pub async fn commands_expand(
    state: State<'_, CoreState>,
    command: String,
    args_text: String,
    workspace_id: Option<WorkspaceId>,
) -> Result<ExpandedCommand, String> {
    state
        .commands_expand(command, args_text, workspace_id)
        .await
        .map_err(|e| e.to_string())
}

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
