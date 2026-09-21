//! `tethys-desktop` — thin Tauri host.
//!
//! Host responsibilities (`architecture.md §8.1`): register tauri commands
//! that forward to `tethys-api`, stream via Channels, configure capabilities.
//! No domain state here.

mod commands;

use std::sync::Arc;
use tethys_core::{Core, CorePaths};

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let core: CoreState = Arc::new(
        tauri::async_runtime::block_on(Core::open(CorePaths::from_home_or_default()))
            .expect("open core"),
    );

    tauri::Builder::default()
        .manage(core)
        // `invoke_handler!` stays a flat list because `tauri::generate_handler!`
        // parses a comma-separated list of command paths and rejects
        // macro-expanded input (tauri-macros `command::handler::Handler`). It is
        // grouped into one blank-line-separated block per namespace so a chunk's
        // edit stays confined to its own block.
        .invoke_handler(tauri::generate_handler![
            // host
            host_info,
            host_pair,
            health,
            // workspace
            workspace_list,
            workspace_add,
            workspace_remove,
            workspace_settings_get,
            workspace_settings_set,
            workspace_status,
            workspace_capabilities,
            // agent
            agent_profiles_list,
            agent_profiles_create,
            agent_profiles_update,
            agent_profiles_delete,
            agent_registry_list,
            agent_registry_install,
            agent_registry_update,
            agent_connections_list,
            agent_connections_restart,
            agent_login,
            agent_logout,
            agent_stderr,
            agent_process_sample,
            agent_env_secret_set,
            agent_health_interval_set,
            agent_recheck,
            agent_config_schema,
            agent_config_get,
            agent_config_validate,
            agent_config_plan,
            agent_config_apply,
            agent_config_rollback,
            // thread
            thread_create,
            thread_list,
            thread_get,
            thread_prompt,
            thread_queue_list,
            thread_queue_add,
            thread_queue_remove,
            thread_queue_reorder,
            thread_cancel,
            thread_cancel_state,
            thread_resume,
            thread_import_sessions,
            thread_fork,
            thread_archive,
            thread_delete,
            thread_set_config_option,
            thread_set_permission_mode,
            // events
            events_subscribe,
            events_unsubscribe,
            events_inbox_subscribe,
            // permission
            permission_respond,
            elicitation_respond,
            permission_rules_list,
            permission_rules_set,
            permission_rules_delete,
            // git
            git_worktree_create,
            git_worktree_remove,
            git_worktree_list,
            git_worktree_archive,
            git_checkpoint_create,
            git_checkpoint_restore,
            git_checkpoint_list,
            git_diff_summary,
            git_diff_file,
            git_stage,
            git_unstage,
            git_discard,
            git_commit,
            git_merge,
            git_push,
            git_pr_create,
            // search
            search_files,
            // mcp
            mcp_registry_list,
            mcp_registry_set,
            mcp_registry_delete,
            mcp_effective,
            mcp_attachments,
            mcp_projection_plan,
            mcp_projection_apply,
            mcp_projection_rollback,
            mcp_projection_verify,
            mcp_import_scan,
            mcp_import_apply,
            mcp_health,
            // skills
            skills_list,
            skills_import,
            skills_update_check,
            skills_update_plan,
            skills_update_apply,
            skills_trust,
            skills_enable,
            // commands
            commands_list,
            commands_expand,
            commands_read,
            commands_write,
            commands_delete,
            // terminal
            terminal_list,
            terminal_attach,
            terminal_write,
            terminal_resize,
            // benchmark helpers
            generate_synthetic_diff,
            run_stream_benchmark,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
