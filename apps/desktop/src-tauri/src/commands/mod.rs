//! Tauri commands — thin adapters over `tethys-api`, one module per namespace.
//!
//! Rules (tauri-v2 skill): owned types only in async commands, `Result`
//! returns, no domain state here (state lives in `tethys-core`).
//!
//! The `invoke_handler!` list lives in `lib.rs` because
//! `tauri::generate_handler!` is a proc-macro that parses a comma-separated
//! list of command paths (`tauri-macros` `command::handler::Handler`) and
//! rejects macro-expanded input. It is kept strictly namespace-grouped there,
//! one blank-line-separated block per owner, so a chunk's edit stays one hunk.

use std::sync::Arc;
use tethys_core::Core;

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

pub mod agent;
pub mod bench;
pub mod commands_ns;
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

pub use agent::*;
pub use bench::*;
pub use commands_ns::*;
pub use events::*;
pub use git::*;
pub use host::*;
pub use mcp::*;
pub use permission::*;
pub use search::*;
pub use skills::*;
pub use terminal::*;
pub use thread::*;
pub use workspace::*;
