//! Shared wire types (Rust ↔ TypeScript).
//!
//! Module: `tethys-schema` — the single seam for the type bridge.
//! Everything the webview can call or receive is declared here with
//! `specta::Type` so `cargo xtask bindings` can export it to
//! `packages/bindings/src/generated/`.
//!
//! Keep this crate dependency-free (serde + specta only): no tokio,
//! no tauri, no filesystem. That keeps `codegen` fast and cacheable.

use serde::{Deserialize, Serialize};
use specta::{Type, Types};

/// Basic host metadata for the S0.0 shell (`host.info`).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct HostInfo {
    pub version: String,
    pub platform: String,
}

/// Liveness probe result (`host.health`).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct HealthStatus {
    pub ok: bool,
    pub core_version: String,
}

/// All root types exported to TypeScript. Add new wire types here so
/// they are included in the generated bindings.
pub fn registered_types() -> Types {
    Types::default()
        .register::<HostInfo>()
        .register::<HealthStatus>()
}
