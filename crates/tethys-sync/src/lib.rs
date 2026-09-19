//! Sync engine: canonical MCP registry, config projection, and skill library.
//!
//! See `docs/architecture.md` §11. This crate owns every path that writes a
//! vendor config file or resolves a secret; nothing above it writes SQL.

pub mod atomic;
pub mod attachments;
pub mod diff;

pub mod error;
pub mod format;
pub mod import;
pub mod manifest;
pub mod projection;
pub mod projectors;
pub mod registry;
pub mod secrets;
pub mod session;
pub mod skill_import;
pub mod skills;
pub mod trust;
pub mod walk;

pub use attachments::{compute_attachment_grid, ProviderInput};
pub use error::SyncError;

pub use manifest::{applied_from_row, applied_to_row, entry_digest, file_digest};
pub use projection::{apply, plan, read_text, rollback, verify, ApplyRequest, PlanRequest};
pub use projectors::{
    projector_for, projectors, ClaudeCodeProjector, CodexProjector, OpenCodeProjector, Projector,
    TargetFile,
};
pub use registry::{
    global_registry_path, read_registry, workspace_registry_path, write_registry, Registry,
    RegistryFile, REGISTRY_VERSION,
};
pub use secrets::{KeyringSecrets, MemorySecrets, SecretStore};
pub use session::{resolve_secrets, session_servers, spawn_servers, spawn_servers_for_provider};

