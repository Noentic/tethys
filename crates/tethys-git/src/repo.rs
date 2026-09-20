//! Repository discovery and git process plumbing.
//!
//! Every path is resolved once through `git rev-parse`, so linked worktrees
//! (where `.git` is a file) work exactly like the main checkout.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::error::{GitError, GitResult};

static TEMP_INDEX_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Git's well-known empty tree object id.
pub(crate) const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/// Resolved locations and identity of one worktree checkout.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitRepo {
    pub worktree_root: PathBuf,
    pub git_dir: PathBuf,
    pub common_dir: PathBuf,
    pub head_oid: Option<String>,
    pub branch: String,
    pub is_main_worktree: bool,
}

impl GitRepo {
    /// Discovers the repository containing `root`.
    pub fn discover(root: &Path) -> GitResult<Self> {
        let output = Command::new("git")
            .current_dir(root)
            .args([
                "rev-parse",
                "--absolute-git-dir",
                "--git-common-dir",
                "--show-toplevel",
            ])
            .output()
            .map_err(|e| GitError::NotARepo(format!("{}: {e}", root.display())))?;
        if !output.status.success() {
            return Err(GitError::NotARepo(root.display().to_string()));
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut lines = stdout.lines();
        let git_dir = lines
            .next()
            .ok_or_else(|| GitError::NotARepo(root.display().to_string()))?;
        let common_raw = lines
            .next()
            .ok_or_else(|| GitError::NotARepo(root.display().to_string()))?;
        let toplevel = lines
            .next()
            .ok_or_else(|| GitError::NotARepo(root.display().to_string()))?;

        let worktree_root = normalize(Path::new(toplevel));
        let git_dir = normalize(Path::new(git_dir));
        let common_dir = if Path::new(common_raw).is_absolute() {
            normalize(Path::new(common_raw))
        } else {
            normalize(&worktree_root.join(common_raw))
        };

        let head_oid = rev_parse_opt(&worktree_root, "HEAD")?;
        let branch = rev_parse_string(&worktree_root, &["--abbrev-ref", "HEAD"])
            .unwrap_or_else(|_| "HEAD".to_string());
        let is_main_worktree = git_dir == common_dir;

        Ok(Self {
            worktree_root,
            git_dir,
            common_dir,
            head_oid,
            branch,
            is_main_worktree,
        })
    }

    /// Runs git and fails on non-zero exit.
    pub(crate) fn git(&self, args: &[&str]) -> GitResult<Vec<u8>> {
        run_checked(&self.worktree_root, args)
    }

    /// Runs git and trims stdout into a string.
    pub(crate) fn git_str(&self, args: &[&str]) -> GitResult<String> {
        let out = self.git(args)?;
        Ok(String::from_utf8_lossy(&out).trim().to_string())
    }

    /// Runs git with literal pathspecs, so user paths are never interpreted
    /// as glob or magic pathspecs.
    pub(crate) fn git_literal(&self, args: &[&str]) -> GitResult<Vec<u8>> {
        let output = self
            .command()
            .env("GIT_LITERAL_PATHSPECS", "1")
            .args(args)
            .output()?;
        if !output.status.success() {
            return Err(GitError::command(args, &output));
        }
        Ok(output.stdout)
    }

    /// Runs git for its exit status only.
    pub(crate) fn git_ok(&self, args: &[&str]) -> GitResult<()> {
        self.git(args).map(|_| ())
    }

    /// Resolves a revision, returning `None` when it does not exist.
    pub(crate) fn rev_parse(&self, rev: &str) -> GitResult<Option<String>> {
        rev_parse_opt(&self.worktree_root, rev)
    }

    /// Creates a git command rooted at this worktree.
    pub(crate) fn command(&self) -> Command {
        let mut cmd = Command::new("git");
        cmd.current_dir(&self.worktree_root);
        cmd
    }

    /// Allocates a temporary index inside the real git dir.
    pub(crate) fn temp_index(&self, tag: &str) -> TempIndex {
        TempIndex::new(self, tag)
    }
}

/// Resolves symlinks for stable path comparison. Uses `dunce` so Windows paths
/// keep their plain drive form: the `\\?\` verbatim prefix `std::fs::canonicalize`
/// returns is rejected by git when used as `GIT_INDEX_FILE`.
fn normalize(path: &Path) -> PathBuf {
    dunce::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// Runs git in `cwd`, failing on non-zero exit.
pub(crate) fn run_checked(cwd: &Path, args: &[&str]) -> GitResult<Vec<u8>> {
    let output = Command::new("git").current_dir(cwd).args(args).output()?;
    if !output.status.success() {
        return Err(GitError::command(args, &output));
    }
    Ok(output.stdout)
}

/// Resolves `rev` in `cwd`, treating failure as "does not exist".
pub(crate) fn rev_parse_opt(cwd: &Path, rev: &str) -> GitResult<Option<String>> {
    let output = Command::new("git")
        .current_dir(cwd)
        .args(["rev-parse", "--verify", "-q", rev])
        .output()?;
    if !output.status.success() {
        return Ok(None);
    }
    let oid = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if oid.is_empty() {
        Ok(None)
    } else {
        Ok(Some(oid))
    }
}

fn rev_parse_string(cwd: &Path, args: &[&str]) -> GitResult<String> {
    let output = Command::new("git")
        .current_dir(cwd)
        .arg("rev-parse")
        .args(args)
        .output()?;
    if !output.status.success() {
        return Err(GitError::command(&["rev-parse"], &output));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// A temporary index file removed on drop, even when an operation fails.
pub(crate) struct TempIndex {
    path: PathBuf,
}

impl TempIndex {
    fn new(repo: &GitRepo, tag: &str) -> Self {
        let safe: String = tag
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
            .collect();
        let counter = TEMP_INDEX_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = repo.git_dir.join(format!(
            "tethys_index_{}_{}_{safe}",
            std::process::id(),
            counter
        ));
        let _ = std::fs::remove_file(&path);
        Self { path }
    }

    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    /// Copies the worktree's real index, falling back to HEAD (or empty).
    pub(crate) fn seed(&self, repo: &GitRepo) -> GitResult<()> {
        let real = repo.git_dir.join("index");
        if real.is_file() {
            std::fs::copy(&real, &self.path)?;
            // `std::fs::copy` stamps the destination with the current time.
            // That makes git's racy-clean check trust stat entries the real
            // index would re-hash, so a same-size edit landing in the same
            // clock tick as the last index write can be dropped from the
            // snapshot. Preserve the source mtime to keep the check equivalent.
            if let Ok(mtime) = std::fs::metadata(&real).and_then(|meta| meta.modified()) {
                let _ = std::fs::File::open(&self.path).and_then(|file| file.set_modified(mtime));
            }
            return Ok(());
        }
        if repo.head_oid.is_some() {
            self.run(repo, &["read-tree", "HEAD"]).map(|_| ())
        } else {
            self.run(repo, &["read-tree", "--empty"]).map(|_| ())
        }
    }

    /// Runs git with `GIT_INDEX_FILE` pointed at this temporary index.
    pub(crate) fn run(&self, repo: &GitRepo, args: &[&str]) -> GitResult<Vec<u8>> {
        let output = repo
            .command()
            .env("GIT_INDEX_FILE", &self.path)
            .args(args)
            .output()?;
        if !output.status.success() {
            return Err(GitError::command(args, &output));
        }
        Ok(output.stdout)
    }

    /// Writes the tree of the temporary index.
    pub(crate) fn write_tree(&self, repo: &GitRepo) -> GitResult<String> {
        let out = self.run(repo, &["write-tree"])?;
        Ok(String::from_utf8_lossy(&out).trim().to_string())
    }
}

impl Drop for TempIndex {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn git(cwd: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(cwd)
            .args(args)
            .output()
            .expect("run git");
        assert!(
            output.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    /// The temp index must keep the source index's mtime, or git's racy-clean
    /// check trusts stat entries the real index would re-hash, and a same-size
    /// edit in the index's own clock tick is dropped from the snapshot.
    #[test]
    fn seed_preserves_the_source_index_mtime() {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path();
        git(root, &["init", "-q", "-b", "main"]);
        git(root, &["config", "user.email", "test@tethys.dev"]);
        git(root, &["config", "user.name", "Tethys Test"]);
        std::fs::write(root.join("f.txt"), "one\n").expect("write");
        git(root, &["add", "-A"]);
        git(root, &["commit", "-qm", "base"]);

        let repo = GitRepo::discover(root).expect("discover");
        let source = repo.git_dir.join("index");
        let source_mtime = std::fs::metadata(&source)
            .expect("source index metadata")
            .modified()
            .expect("source index mtime");

        let temp = repo.temp_index("seed");
        temp.seed(&repo).expect("seed");

        let seeded_mtime = std::fs::metadata(temp.path())
            .expect("temp index metadata")
            .modified()
            .expect("temp index mtime");
        assert_eq!(seeded_mtime, source_mtime);
    }
}
