//! Shared wire types (Rust ↔ TypeScript).
//!
//! Module: `tethys-schema` — the single seam for the type bridge.
//! Everything the webview can call or receive is declared here with
//! `specta::Type` so `cargo xtask bindings` can export it to
//! `packages/bindings/src/generated/`.
//!
//! Keep this crate dependency-free (serde + specta only): no tokio,
//! no tauri, no filesystem. That keeps `codegen` fast and cacheable.

pub mod git;

pub use git::*;

pub mod workspace;

pub use workspace::*;

pub mod cancel;

pub use cancel::*;

pub mod agents;

pub use agents::*;

pub mod catalog;

pub use catalog::*;

pub mod elicitation;

pub use elicitation::*;

use serde::{Deserialize, Serialize};
use specta::{Type, Types};

pub mod composer;
pub mod connection;
pub mod provider_extension;
pub mod queue;
pub mod search;
pub mod sync;
pub mod thread;

pub use search::SearchItem;
pub use sync::WorkspaceId;

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

/// A chunk emitted over Tauri IPC streaming channels (S0.1).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct StreamChunk {
    pub stream_id: u32,
    pub seq: u32,
    pub timestamp_ms: f64,
    pub payload: String,
}

/// A diff hunk representation for virtualized rendering (S0.1, AD-10).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct DiffHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
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

pub mod store;

/// All root types exported to TypeScript. Add new wire types here so
/// they are included in the generated bindings.
pub fn registered_types() -> Types {
    Types::default()
        .register::<HostInfo>()
        .register::<HealthStatus>()
        .register::<search::SearchItem>()
        .register::<composer::CommandScope>()
        .register::<composer::CommandInfo>()
        .register::<composer::ReferenceKind>()
        .register::<composer::ComposerReference>()
        .register::<composer::ExpandedCommand>()
        .register::<StreamChunk>()
        .register::<DiffHunk>()
        .register::<DiffLine>()
        .register::<DiffLineKind>()
        .register::<BenchmarkConfig>()
        .register::<BenchmarkResult>()
        .register::<git::WorkspaceGitConfig>()
        .register::<git::WorktreeSpec>()
        .register::<git::WorktreeInfo>()
        .register::<git::SetupOutcome>()
        .register::<git::CheckpointPhase>()
        .register::<git::CheckpointInfo>()
        .register::<git::CheckpointResult>()
        .register::<git::DiffSource>()
        .register::<git::DiffFileStatus>()
        .register::<git::DiffFile>()
        .register::<git::DiffSummary>()
        .register::<git::DiffFileDetail>()
        .register::<git::HunkRef>()
        .register::<git::CommitResult>()
        .register::<git::RestorePolicy>()
        .register::<git::RestoreTarget>()
        .register::<git::UndoCapture>()
        .register::<git::RestoreOutcome>()
        .register::<connection::AcpProtocol>()
        .register::<connection::ConnectionState>()
        .register::<connection::AgentInfo>()
        .register::<connection::NormalizedCapabilities>()
        .register::<connection::AgentCompat>()
        .register::<connection::ConnectionKey>()
        .register::<connection::ConnectionEntry>()
        .register::<agents::AuthMethodShape>()
        .register::<agents::AuthMethodView>()
        .register::<agents::EnvVarInput>()
        .register::<agents::LaunchSpecInput>()
        .register::<agents::BackendClass>()
        .register::<agents::RegistryRef>()
        .register::<agents::ProviderHealth>()
        .register::<agents::RecheckStatus>()
        .register::<agents::AgentProfileView>()
        .register::<agents::ProfileInput>()
        .register::<agents::AgentRegistryEntryView>()
        .register::<agents::UpdateAvailability>()
        .register::<agents::InstallResult>()
        .register::<agents::ProcessSample>()
        .register::<thread::ThreadId>()
        .register::<thread::ThreadState>()
        .register::<thread::CreateThread>()
        .register::<thread::ThreadSummary>()
        .register::<thread::TurnEventBody>()
        .register::<thread::EventEnvelope>()
        .register::<queue::QueuedPrompt>()
        .register::<cancel::CancelPhase>()
        .register::<cancel::CancelState>()
        .register::<provider_extension::ProviderExtension>()
        .register::<store::BlobHash>()
        .register::<store::SeqRange>()
        .register::<store::EntryKind>()
        .register::<store::EntryUpsert>()
        .register::<store::NewEvent>()
        .register::<store::Entry>()
        .register::<store::EntryPage>()
        .register::<store::ThreadView>()
        .register::<store::StoredEvent>()
        .register::<sync::ProjectionTarget>()
        .register::<sync::TargetId>()
        .register::<sync::TransportKind>()
        .register::<sync::Scope>()
        .register::<sync::RegistryValue>()
        .register::<sync::EntryMeta>()
        .register::<sync::RegistryEntry>()
        .register::<sync::McpTransports>()
        .register::<sync::SessionServer>()
        .register::<sync::EntryState>()
        .register::<sync::EntryProjection>()
        .register::<sync::ProjectionPlan>()
        .register::<sync::Applied>()
        .register::<sync::VerifyStatus>()
        .register::<sync::ImportCandidate>()
        .register::<sync::ImportFailure>()
        .register::<sync::ImportScan>()
        .register::<sync::SkillOrigin>()
        .register::<sync::SkillSource>()
        .register::<sync::SkillInfo>()
        .register::<sync::SkillUpdateCheck>()
        .register::<sync::SkillUpdatePlan>()
        .register::<sync::SkillUpdateApplied>()
        .register::<sync::RegistryEntryView>()
        .register::<sync::SkillImportSource>()
        .register::<sync::WorkspaceId>()
        .register::<sync::ServerRow>()
        .register::<sync::ProviderColumn>()
        .register::<sync::AttachmentCell>()
        .register::<sync::AttachmentState>()
        .register::<sync::AttachmentGrid>()
        .register::<workspace::WorkspaceCapabilities>()
        .register::<workspace::Vcs>()
        .register::<workspace::GitHost>()
        .register::<workspace::PermissionMode>()
        .register::<catalog::WorkspaceTrustState>()
        .register::<catalog::TrustScope>()
        .register::<catalog::TrustGrant>()
        .register::<catalog::WorkspaceListItem>()
        .register::<catalog::WorkspaceSessionSummary>()
        .register::<elicitation::ElicitationEnumOption>()
        .register::<elicitation::ElicitationFieldKind>()
        .register::<elicitation::ElicitationField>()
        .register::<elicitation::ElicitationRequest>()
        .register::<elicitation::ElicitationValue>()
        .register::<elicitation::ElicitationOutcome>()
        .register::<elicitation::ElicitationResponse>()
}
