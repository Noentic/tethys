//! Committing thread work to the thread branch.

use tethys_schema::CommitResult;

use crate::error::{GitError, GitResult};
use crate::repo::GitRepo;

/// Commits staged changes (or the given paths) with a caller-supplied message.
pub fn commit(repo: &GitRepo, message: &str, paths: Option<&[String]>) -> GitResult<CommitResult> {
    if message.trim().is_empty() {
        return Err(GitError::InvalidArgument(
            "commit message is required".to_string(),
        ));
    }
    let mut args: Vec<&str> = vec!["commit", "-m", message];
    if let Some(paths) = paths {
        if !paths.is_empty() {
            args.push("--");
            args.extend(paths.iter().map(String::as_str));
        }
    }
    let output = repo
        .command()
        .env("GIT_LITERAL_PATHSPECS", "1")
        .args(&args)
        .output()?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        if stderr.contains("nothing to commit") || stdout.contains("nothing to commit") {
            return Err(GitError::NothingToCommit);
        }
        return Err(GitError::command(&args, &output));
    }
    let oid = repo.git_str(&["rev-parse", "HEAD"])?;
    let summary = repo
        .git_str(&["show", "--shortstat", "--format=", "HEAD"])
        .unwrap_or_default();
    Ok(CommitResult {
        oid,
        summary: summary.trim().to_string(),
    })
}
