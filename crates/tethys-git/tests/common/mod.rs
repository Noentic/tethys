#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::process::Command;

use tethys_git::{GitEngine, GitError, GitResult, SetupRunner};
use tethys_schema::SetupOutcome;

/// Isolated repository fixture cleaned up on drop.
pub struct TestRepo {
    _dir: tempfile::TempDir,
    pub root: PathBuf,
}

impl TestRepo {
    pub fn init() -> Self {
        let dir = tempfile::tempdir().expect("create temp dir");
        let root = dir.path().to_path_buf();
        std::fs::create_dir_all(root.join("pkg")).expect("create pkg dir");
        let repo = Self { _dir: dir, root };
        repo.git(&["init", "-q", "-b", "main"]);
        repo.git(&["config", "core.autocrlf", "false"]);
        repo.git(&["config", "user.name", "Tethys Test"]);
        repo.git(&["config", "user.email", "test@tethys.dev"]);
        repo
    }

    pub fn git(&self, args: &[&str]) -> String {
        self.git_in(&self.root, args)
    }

    pub fn git_in(&self, cwd: &std::path::Path, args: &[&str]) -> String {
        let output = Command::new("git")
            .current_dir(cwd)
            .args(args)
            .output()
            .expect("run git");
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).to_string()
    }

    pub fn write(&self, path: &str, content: &str) {
        let full = self.root.join(path);
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent).expect("create parent dir");
        }
        std::fs::write(full, content).expect("write file");
    }

    pub fn write_bytes(&self, path: &str, content: &[u8]) {
        let full = self.root.join(path);
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent).expect("create parent dir");
        }
        std::fs::write(full, content).expect("write file");
    }

    pub fn read(&self, path: &str) -> String {
        std::fs::read_to_string(self.root.join(path)).expect("read file")
    }

    pub fn remove(&self, path: &str) {
        std::fs::remove_file(self.root.join(path)).expect("remove file");
    }

    pub fn exists(&self, path: &str) -> bool {
        self.root.join(path).exists()
    }

    pub fn commit(&self, message: &str) {
        self.git(&["add", "-A"]);
        self.git(&["commit", "-q", "-m", message]);
    }

    pub fn engine(&self) -> GitEngine {
        GitEngine::open(&self.root).expect("open engine")
    }
}

/// Setup runner that records the script it ran.
pub struct NoopSetupRunner {
    pub last_script: std::sync::Mutex<Option<String>>,
}

impl NoopSetupRunner {
    pub fn new() -> Self {
        Self {
            last_script: std::sync::Mutex::new(None),
        }
    }
}

impl Default for NoopSetupRunner {
    fn default() -> Self {
        Self::new()
    }
}

impl SetupRunner for NoopSetupRunner {
    fn run(&self, script: &str, _cwd: &Path) -> GitResult<SetupOutcome> {
        *self.last_script.lock().expect("lock") = Some(script.to_string());
        Ok(SetupOutcome {
            exit_code: Some(0),
            stderr: String::new(),
            timed_out: false,
        })
    }
}

/// Setup runner that fails, proving worktree creation rolls back.
pub struct FailingSetupRunner;

impl SetupRunner for FailingSetupRunner {
    fn run(&self, script: &str, _cwd: &Path) -> GitResult<SetupOutcome> {
        Err(GitError::CommandFailed {
            command: script.to_string(),
            code: Some(1),
            stderr: "setup failed".to_string(),
        })
    }
}
