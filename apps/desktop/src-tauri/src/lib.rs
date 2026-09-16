//! `tethys-desktop` — thin Tauri host.
//!
//! Host responsibilities (`architecture.md §8.1`): register tauri-specta
//! commands that forward to `tethys-api`, stream later via Channels,
//! configure capabilities. No domain state here.

mod commands;

use std::sync::Arc;
use tauri_specta::{collect_commands, Builder};
use tethys_core::Core;

use commands::{health, host_info, CoreState};

fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![host_info, health])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let core: CoreState = Arc::new(Core::new(env!("CARGO_PKG_VERSION")));
    let builder = specta_builder();

    tauri::Builder::default()
        .manage(core)
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
