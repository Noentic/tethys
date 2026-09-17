use std::path::Path;
use std::process::Command;
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct CheckpointResult {
    pub commit_oid: String,
    pub ref_name: String,
    pub elapsed_ms: f64,
}

pub struct GitEngine;

impl GitEngine {
    /// Creates a non-destructive turn checkpoint using a temporary index file.
    /// Leaves the user's working index and current branch untouched (architecture §10.3).
    ///
    /// When `changed_paths` is provided (via file watcher / change detector per §10.4),
    /// updates only those paths in the temp index, achieving sub-100ms snapshots on 100k+ repos.
    /// If `None`, falls back to full working tree scan (`git add -A`).
    pub fn create_checkpoint(
        worktree_root: &Path,
        thread_id: &str,
        turn_index: u32,
        prev_commit: Option<&str>,
        changed_paths: Option<&[impl AsRef<Path>]>,
    ) -> std::io::Result<CheckpointResult> {
        let t0 = Instant::now();
        let tmp_index = worktree_root.join(format!(".git/tethys_index_{thread_id}_{turn_index}"));

        // 1. Initialize temporary index: copy existing stat cache from .git/index if present,
        // otherwise read-tree HEAD.
        let base_index = worktree_root.join(".git/index");
        if base_index.exists() {
            std::fs::copy(&base_index, &tmp_index)?;
        } else {
            let status = Command::new("git")
                .current_dir(worktree_root)
                .env("GIT_INDEX_FILE", &tmp_index)
                .args(["read-tree", "HEAD"])
                .status()?;
            if !status.success() {
                let _ = std::fs::remove_file(&tmp_index);
                return Err(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "git read-tree HEAD failed",
                ));
            }
        }

        // 2. Add changes into temporary index
        let mut add_cmd = Command::new("git");
        add_cmd
            .current_dir(worktree_root)
            .env("GIT_INDEX_FILE", &tmp_index);

        if let Some(paths) = changed_paths {
            if paths.is_empty() {
                add_cmd.args(["add", "-A"]);
            } else {
                add_cmd.arg("add").arg("-A").arg("--");
                for p in paths {
                    add_cmd.arg(p.as_ref());
                }
            }
        } else {
            add_cmd.args(["add", "-A"]);
        }

        let status = add_cmd.status()?;
        if !status.success() {
            let _ = std::fs::remove_file(&tmp_index);
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "git add failed",
            ));
        }

        // 3. write-tree
        let output = Command::new("git")
            .current_dir(worktree_root)
            .env("GIT_INDEX_FILE", &tmp_index)
            .args(["write-tree"])
            .output()?;
        let tree = String::from_utf8_lossy(&output.stdout).trim().to_string();

        // 4. commit-tree
        let mut commit_cmd = Command::new("git");
        commit_cmd
            .current_dir(worktree_root)
            .args(["commit-tree", &tree]);
        if let Some(prev) = prev_commit {
            commit_cmd.args(["-p", prev]);
        } else if let Ok(head) = Self::rev_parse_head(worktree_root) {
            commit_cmd.args(["-p", &head]);
        }
        commit_cmd.args(["-m", &format!("tethys turn {turn_index}")]);

        let output = commit_cmd.output()?;
        let commit_oid = String::from_utf8_lossy(&output.stdout).trim().to_string();

        // 5. update-ref
        let ref_name = format!("refs/tethys/checkpoints/{thread_id}/{turn_index}");
        let status = Command::new("git")
            .current_dir(worktree_root)
            .args(["update-ref", &ref_name, &commit_oid])
            .status()?;

        // Clean up temporary index
        let _ = std::fs::remove_file(&tmp_index);

        if !status.success() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "git update-ref failed",
            ));
        }

        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;

        Ok(CheckpointResult {
            commit_oid,
            ref_name,
            elapsed_ms,
        })
    }

    /// Restores worktree files to a previous checkpoint.
    pub fn restore_checkpoint(worktree_root: &Path, commit_oid: &str) -> std::io::Result<()> {
        let status = Command::new("git")
            .current_dir(worktree_root)
            .args(["read-tree", "-u", "--reset", commit_oid])
            .status()?;
        if !status.success() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "git read-tree reset failed",
            ));
        }
        Ok(())
    }

    /// Generates unified git diff between two checkpoints.
    pub fn get_checkpoint_diff(
        worktree_root: &Path,
        from_commit: &str,
        to_commit: &str,
    ) -> std::io::Result<String> {
        let output = Command::new("git")
            .current_dir(worktree_root)
            .args(["diff", from_commit, to_commit])
            .output()?;
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    fn rev_parse_head(worktree_root: &Path) -> std::io::Result<String> {
        let output = Command::new("git")
            .current_dir(worktree_root)
            .args(["rev-parse", "HEAD"])
            .output()?;
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
}
