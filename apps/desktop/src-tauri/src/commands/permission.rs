//! `permission.*` commands.

use tauri::State;
use tethys_api::PermissionApi;
use tethys_schema::elicitation::ElicitationResponse;
use tethys_schema::thread::ThreadId;

use crate::commands::CoreState;

/// `permission.respond` — answers a surfaced request with the Provider's own
/// `option_id` (M1.8).
#[tauri::command]
#[specta::specta]
pub async fn permission_respond(
    state: State<'_, CoreState>,
    thread_id: ThreadId,
    req_id: String,
    option_id: Option<String>,
) -> Result<(), String> {
    state
        .permission_respond(thread_id, req_id, option_id)
        .await
        .map_err(|e| e.to_string())
}

/// `permission.elicitation_respond` — answers a surfaced elicitation (M1.7).
#[tauri::command]
#[specta::specta]
pub async fn elicitation_respond(
    state: State<'_, CoreState>,
    thread_id: ThreadId,
    response: ElicitationResponse,
) -> Result<(), String> {
    state
        .elicitation_respond(thread_id, response)
        .await
        .map_err(|e| e.to_string())
}

stub_cmd!(permission_rules_list);
stub_cmd!(permission_rules_set);
stub_cmd!(permission_rules_delete);
