//! `terminal.*` commands.

use tauri::State;
use tethys_api::TerminalApi;

use crate::commands::CoreState;

stub_cmd!(terminal_list);
stub_cmd!(terminal_attach);
stub_cmd!(terminal_write);
stub_cmd!(terminal_resize);
