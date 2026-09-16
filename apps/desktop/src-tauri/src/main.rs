//! Thin Tauri host — forwards IPC to `tethys-api`, holds no domain state.
//!
//! All application logic lives in `lib.rs` (required for mobile builds);
//! `main.rs` is a thin passthrough (tauri-v2 skill).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tethys_desktop_lib::run();
}
