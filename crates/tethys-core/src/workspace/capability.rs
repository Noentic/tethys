//! Capability resolver: a pure function from a folder to its
//! `WorkspaceCapabilities` (`architecture.md` §10.6).
//!
//! `vcs` and `max_concurrent_sessions` are functions of the folder alone (git
//! presence and remote host); `restore` is passed in because it also depends on
//! checkpoint availability and, per session, the Provider's `initialize`
//! result. M2.1 adds `isolation` and `forge_cli` to [`CapabilityInputs`] and
//! branches here, never in a second resolver.

use std::path::Path;

use tethys_git::GitRepo;
use tethys_schema::workspace::{GitHost, Vcs, WorkspaceCapabilities};

/// Inputs the folder alone cannot answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CapabilityInputs {
    /// Checkpoints are possible for this folder.
    pub restore: bool,
}

/// Classifies the folder's version control from read-only `tethys-git` reads.
pub fn vcs_for_root(root: &Path) -> Vcs {
    match GitRepo::discover(root) {
        Ok(repo) => match tethys_git::remote_url_in_repo(&repo, "origin") {
            Ok(Some(url)) => Vcs::GitRemote {
                host: host_for(&url),
            },
            _ => Vcs::GitLocal,
        },
        Err(_) => Vcs::None,
    }
}

/// `Some(1)` where no worktree mechanism isolates parallel sessions.
pub fn max_concurrent_sessions_for_vcs(vcs: &Vcs) -> Option<u32> {
    if matches!(vcs, Vcs::None) {
        Some(1)
    } else {
        None
    }
}

/// The concurrency cap for a folder, read directly (the `thread.create` guard
/// and the resolver share this one rule).
pub fn max_concurrent_sessions_for_root(root: &Path) -> Option<u32> {
    max_concurrent_sessions_for_vcs(&vcs_for_root(root))
}

/// Resolves a folder's capabilities with explicit inputs.
pub fn resolve(root: &Path, inputs: CapabilityInputs) -> WorkspaceCapabilities {
    let vcs = vcs_for_root(root);
    WorkspaceCapabilities {
        restore: inputs.restore,
        max_concurrent_sessions: max_concurrent_sessions_for_vcs(&vcs),
        vcs,
    }
}

/// Resolves a folder's capabilities from the folder alone: `restore` reports
/// whether the folder *can* hold checkpoints (git present).
pub fn resolve_folder(root: &Path) -> WorkspaceCapabilities {
    let vcs = vcs_for_root(root);
    let restore = !matches!(vcs, Vcs::None);
    WorkspaceCapabilities {
        restore,
        max_concurrent_sessions: max_concurrent_sessions_for_vcs(&vcs),
        vcs,
    }
}

/// Reads the remote host out of a git URL (never an entry point).
fn host_for(url: &str) -> GitHost {
    let lower = url.to_ascii_lowercase();
    if lower.contains("github.com") {
        GitHost::Github
    } else if lower.contains("gitlab.com") {
        GitHost::Gitlab
    } else {
        GitHost::Other
    }
}
