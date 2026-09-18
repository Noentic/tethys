//! Worktree lifecycle (`architecture.md` §10.2, WT-01/WT-02).

use std::path::Path;

use tethys_schema::{WorktreeInfo, WorktreeSpec};

use crate::bootstrap;
use crate::error::{GitError, GitResult};
use crate::read;
use crate::repo::GitRepo;
use crate::setup::SetupRunner;

/// Default worktree location: `~/.tethys/worktrees/<repo-id>/<slug>`.
pub fn default_worktree_path(project_root: &Path, slug: &str) -> GitResult<String> {
    if slug.is_empty() {
        return Err(GitError::InvalidArgument("slug is required".to_string()));
    }
    let home = dirs::home_dir()
        .ok_or_else(|| GitError::InvalidArgument("cannot resolve home directory".to_string()))?;
    let repo = GitRepo::discover(project_root)?;
    let key = repo.common_dir.to_string_lossy();
    let hex = blake3::hash(key.as_bytes()).to_hex();
    let repo_id = &hex.as_str()[..16];
    Ok(home
        .join(".tethys")
        .join("worktrees")
        .join(repo_id)
        .join(slug)
        .to_string_lossy()
        .into_owned())
}

/// Materializes a thread worktree (or registers the main checkout).
pub fn create(
    repo: &GitRepo,
    spec: &WorktreeSpec,
    runner: &dyn SetupRunner,
) -> GitResult<WorktreeInfo> {
    if spec.main_checkout {
        return Ok(WorktreeInfo {
            thread_id: spec.thread_id.clone(),
            project_root: repo.worktree_root.to_string_lossy().into_owned(),
            path: repo.worktree_root.to_string_lossy().into_owned(),
            branch: repo.branch.clone(),
            base: spec.base.clone(),
            head: repo.head_oid.clone().unwrap_or_default(),
            main_checkout: true,
            warnings: Vec::new(),
            setup: None,
        });
    }

    if spec.slug.is_empty() {
        return Err(GitError::InvalidArgument("slug is required".to_string()));
    }
    if spec.branch.is_empty() {
        return Err(GitError::InvalidArgument("branch is required".to_string()));
    }
    let path = if spec.path.trim().is_empty() {
        default_worktree_path(Path::new(&spec.project_root), &spec.slug)?
    } else {
        spec.path.clone()
    };
    if Path::new(&path).exists() {
        return Err(GitError::InvalidPath(format!(
            "worktree path already exists: {path}"
        )));
    }

    let check = repo
        .command()
        .args(["check-ref-format", "--branch", &spec.branch])
        .output()?;
    if !check.status.success() {
        return Err(GitError::InvalidArgument(format!(
            "invalid branch name: {}",
            spec.branch
        )));
    }

    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent)?;
    }
    repo.git_ok(&["worktree", "add", "-b", &spec.branch, &path, &spec.base])?;

    let prepared = (|| -> GitResult<(Vec<String>, Option<tethys_schema::SetupOutcome>)> {
        let main_root =
            read::main_worktree_root(repo).unwrap_or_else(|_| repo.worktree_root.clone());
        bootstrap::copy(&main_root, Path::new(&path), &spec.bootstrap_globs)?;
        let setup = match spec
            .setup_script
            .as_deref()
            .map(str::trim)
            .filter(|script| !script.is_empty())
        {
            Some(script) => Some(runner.run(script, Path::new(&path))?),
            None => None,
        };
        Ok((warnings_for(&main_root), setup))
    })();

    match prepared {
        Ok((warnings, setup)) => Ok(WorktreeInfo {
            thread_id: spec.thread_id.clone(),
            project_root: repo.worktree_root.to_string_lossy().into_owned(),
            path: path.clone(),
            branch: spec.branch.clone(),
            base: spec.base.clone(),
            head: repo.git_str(&["-C", &path, "rev-parse", "HEAD"])?,
            main_checkout: false,
            warnings,
            setup,
        }),
        Err(error) => {
            let _ = repo.git_ok(&["worktree", "remove", "--force", &path]);
            Err(error)
        }
    }
}

fn warnings_for(root: &Path) -> Vec<String> {
    let mut warnings = Vec::new();
    if let Ok(attributes) = std::fs::read_to_string(root.join(".gitattributes")) {
        if attributes.contains("filter=lfs") {
            warnings.push("repository uses Git LFS; pointers are copied as-is".to_string());
        }
    }
    if root.join(".gitmodules").is_file() {
        warnings.push(
            "repository has submodules; they are not initialized in the worktree".to_string(),
        );
    }
    warnings
}
