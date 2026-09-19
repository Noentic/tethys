//! Injected runner for the optional worktree setup script.

use std::path::Path;

use tethys_schema::SetupOutcome;

use crate::error::GitResult;

/// Runs a setup script inside a freshly created worktree.
///
/// The engine stays dependency-free: hosts wire the real process runner
/// (`tethys-supervisor` with the cancellation ladder), tests pass a stub.
pub trait SetupRunner: Send + Sync {
    fn run(&self, script: &str, cwd: &Path) -> GitResult<SetupOutcome>;
}
