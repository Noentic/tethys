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

pub mod connection;
pub mod thread;

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

/// A search item result returned by FFF search (`search.files`).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SearchItem {
    pub relative_path: String,
    pub score: i32,
}

/// A chunk emitted over Tauri IPC streaming channels (S0.1).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct StreamChunk {
    pub stream_id: u32,
    pub seq: u32,
    pub timestamp_ms: f64,
    pub payload: String,
}

/// A diff hunk representation for virtualized rendering (S0.1, AD-10).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DiffHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum DiffLineKind {
    Context,
    Addition,
    Deletion,
}

/// Benchmark configuration for S0.1 IPC test harness.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BenchmarkConfig {
    pub streams: u32,
    pub total_messages: u32,
    pub message_size_bytes: u32,
}

/// Results returned from IPC streaming benchmark.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BenchmarkResult {
    pub total_messages: u32,
    pub elapsed_ms: f64,
    pub messages_per_sec: f64,
    pub p95_latency_ms: f64,
}

/// All root types exported to TypeScript. Add new wire types here so
/// they are included in the generated bindings.
pub fn registered_types() -> Types {
    Types::default()
        .register::<HostInfo>()
        .register::<HealthStatus>()
        .register::<SearchItem>()
        .register::<StreamChunk>()
        .register::<DiffHunk>()
        .register::<DiffLine>()
        .register::<DiffLineKind>()
        .register::<BenchmarkConfig>()
        .register::<BenchmarkResult>()
        .register::<connection::AcpProtocol>()
        .register::<connection::ConnectionState>()
        .register::<connection::AgentInfo>()
        .register::<connection::NormalizedCapabilities>()
        .register::<connection::AgentCompat>()
        .register::<connection::ConnectionKey>()
        .register::<connection::ConnectionEntry>()
        .register::<thread::ThreadId>()
        .register::<thread::ThreadState>()
        .register::<thread::TurnEventBody>()
        .register::<thread::EventEnvelope>()
}
