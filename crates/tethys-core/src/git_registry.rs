//! Thread → worktree registry, project git config, and the process setup runner.
//!
//! `tethys-git` stays pure: Core owns configuration loading, engine lifetime,
//! and the async/blocking boundary.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::process::Command;

use serde::Deserialize;
use tethys_api::ApiError;
use tethys_git::{GitEngine, GitError, GitOptions, SetupRunner};
use tethys_schema::{SetupOutcome, WorkspaceGitConfig, WorktreeInfo};
use tethys_supervisor::SupervisedChild;

/// Runtime state a thread reports; used to place start/end checkpoints.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ThreadRuntimeState {
    #[default]
    Idle,
    Running,
    Error,
    Interrupted,
    Suspended,
}

/// A registered thread worktree plus its engine and resolved config.
#[derive(Debug, Clone)]
pub struct RegisteredWorktree {
    pub info: WorktreeInfo,
    pub engine: Arc<GitEngine>,
    pub config: WorkspaceGitConfig,
    pub last_state: ThreadRuntimeState,
}

/// In-memory registry; engines are shared per worktree path.
#[derive(Default)]
pub struct GitRegistry {
    threads: HashMap<String, RegisteredWorktree>,
    engines: HashMap<String, Arc<GitEngine>>,
}

impl GitRegistry {
    /// Returns a shared engine for the repository at `root`, creating it once.
    pub fn engine(&mut self, root: &str, options: GitOptions) -> Result<Arc<GitEngine>, GitError> {
        let key = engine_key(root);
        if let Some(existing) = self.engines.get(&key) {
            return Ok(existing.clone());
        }
        let engine = Arc::new(GitEngine::open_with(Path::new(root), options)?);
        self.engines.insert(key, engine.clone());
        Ok(engine)
    }

    pub fn register(
        &mut self,
        info: WorktreeInfo,
        engine: Arc<GitEngine>,
        config: WorkspaceGitConfig,
    ) {
        self.threads.insert(
            info.thread_id.clone(),
            RegisteredWorktree {
                info,
                engine,
                config,
                last_state: ThreadRuntimeState::Idle,
            },
        );
    }

    pub fn get(&self, thread_id: &str) -> Option<&RegisteredWorktree> {
        self.threads.get(thread_id)
    }

    pub fn set_state(&mut self, thread_id: &str, state: ThreadRuntimeState) {
        if let Some(registered) = self.threads.get_mut(thread_id) {
            registered.last_state = state;
        }
    }

    pub fn remove(&mut self, thread_id: &str) -> Option<RegisteredWorktree> {
        let removed = self.threads.remove(thread_id);
        if let Some(registered) = &removed {
            let still_used = self
                .threads
                .values()
                .any(|thread| thread.info.path == registered.info.path);
            if !still_used {
                self.engines.remove(&engine_key(&registered.info.path));
            }
        }
        removed
    }

    pub fn list(&self) -> Vec<WorktreeInfo> {
        self.threads
            .values()
            .map(|registered| registered.info.clone())
            .collect()
    }
}

fn engine_key(root: &str) -> String {
    let path = Path::new(root);
    std::fs::canonicalize(path)
        .unwrap_or_else(|_| PathBuf::from(path))
        .to_string_lossy()
        .into_owned()
}

#[derive(Deserialize)]
struct WorkspaceConfigFile {
    #[serde(default)]
    git: WorkspaceGitConfig,
}

/// Loads `<workspace>/.tethys/config.json`; missing file means defaults.
pub fn load_git_config(workspace_root: &str) -> Result<WorkspaceGitConfig, ApiError> {
    let path = Path::new(workspace_root).join(".tethys").join("config.json");
    if !path.is_file() {
        return Ok(WorkspaceGitConfig::default());
    }
    let raw = std::fs::read_to_string(&path)
        .map_err(|error| ApiError::InvalidConfig(format!("{}: {error}", path.display())))?;
    let parsed: WorkspaceConfigFile = serde_json::from_str(&raw)
        .map_err(|error| ApiError::InvalidConfig(format!("{}: {error}", path.display())))?;
    Ok(parsed.git)
}

/// Runs setup scripts through `tethys-supervisor` with a timeout and kill ladder.
pub struct ProcessSetupRunner {
    pub timeout: Duration,
}

impl SetupRunner for ProcessSetupRunner {
    fn run(&self, script: &str, cwd: &Path) -> Result<SetupOutcome, GitError> {
        let (handle, _runtime) = match tokio::runtime::Handle::try_current() {
            Ok(handle) => (handle, None),
            Err(_) => {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(GitError::Io)?;
                let handle = rt.handle().clone();
                (handle, Some(rt))
            }
        };

        let _guard = handle.enter();

        let mut command = shell_command(script);
        command.current_dir(cwd);
        let mut child = SupervisedChild::spawn(command, 256 * 1024).map_err(GitError::Io)?;

        let deadline = Instant::now() + self.timeout;
        let mut timed_out = false;
        let mut status = None;
        loop {
            match child.try_wait().map_err(GitError::Io)? {
                Some(finished) => {
                    status = Some(finished);
                    break;
                }
                None if Instant::now() >= deadline => {
                    handle
                        .block_on(child.cancel_ladder(Duration::from_millis(500)))
                        .map_err(GitError::Io)?;
                    timed_out = true;
                    break;
                }
                None => std::thread::sleep(Duration::from_millis(20)),
            }
        }

        Ok(SetupOutcome {
            exit_code: status.and_then(|finished| finished.code()),
            stderr: child.stderr_buffer().to_string_lossy(),
            timed_out,
        })
    }
}

fn shell_command(script: &str) -> Command {
    if cfg!(windows) {
        let mut command = Command::new("cmd");
        command.args(["/C", script]);
        command
    } else {
        let mut command = Command::new("sh");
        command.arg("-c").arg(script);
        command
    }
}
