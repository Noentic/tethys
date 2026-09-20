//! ACP-Registry install engine (M1.12).
//!
//! The registry is an external contract; the schema in [`model`] is the
//! published `FORMAT.md` shape and tolerates additions. The fetch sits behind
//! [`client::RegistrySource`] so tests inject a wiremock-backed source and the
//! default suite stays deterministic.

pub mod client;
pub mod install;
pub mod model;
pub mod platform;

pub use client::{HttpRegistrySource, RegistrySource, REGISTRY_URL};
pub use install::{compliance_note, install, update_availability, InstallOptions, InstallOutcome};
pub use model::{
    BinaryTarget, Distribution, NpxDistribution, Registry, RegistryAgent, UvxDistribution,
};

/// Errors from the registry engine.
#[derive(Debug, thiserror::Error)]
pub enum RegistryError {
    #[error("registry fetch failed: {0}")]
    Fetch(String),
    #[error("unknown registry agent: {0}")]
    UnknownAgent(String),
    #[error("registry document is malformed: {0}")]
    Malformed(String),
    #[error("version {requested} of {id} is unavailable (latest only)")]
    VersionUnavailable { id: String, requested: String },
    #[error("unsupported distribution: {0}")]
    UnsupportedDistribution(String),
    #[error("unsupported platform: {0}")]
    UnsupportedPlatform(String),
    #[error("integrity check failed: expected {expected}, calculated {actual}")]
    Integrity { expected: String, actual: String },
    #[error("install failed: {0}")]
    Install(String),
}
