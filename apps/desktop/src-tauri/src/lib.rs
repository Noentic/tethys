//! `tethys-desktop` — thin Tauri host.
//!
//! Host responsibilities (`architecture.md §8.1`): register tauri commands
//! that forward to `tethys-api`, stream via Channels, configure capabilities.
//! No domain state here.

mod commands;

use std::sync::Arc;
use tethys_core::Core;

use commands::{
    generate_synthetic_diff, health, host_info, run_stream_benchmark, search_files, CoreState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let core: CoreState = Arc::new(Core::new(env!("CARGO_PKG_VERSION")));

    tauri::Builder::default()
        .manage(core)
        .invoke_handler(tauri::generate_handler![
            host_info,
            health,
            search_files,
            generate_synthetic_diff,
            run_stream_benchmark
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
