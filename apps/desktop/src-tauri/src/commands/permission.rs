//! `permission.*` commands.

use tauri::State;
use tethys_api::PermissionApi;

use crate::commands::CoreState;

stub_cmd!(permission_respond);
stub_cmd!(permission_rules_list);
stub_cmd!(permission_rules_set);
stub_cmd!(permission_rules_delete);
