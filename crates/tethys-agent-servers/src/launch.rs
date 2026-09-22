use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct LaunchSpec {
    pub profile_id: String,
    /// Stable ACP Registry identity; profile identity remains `profile_id`.
    pub integration_id: Option<String>,
    pub host: String,
    pub program: String,
    pub args: Vec<String>,
    pub cwd: Option<PathBuf>,
    pub env: Vec<(String, String)>,
    pub stderr_capacity: usize,
}

impl LaunchSpec {
    pub fn new(profile_id: impl Into<String>, program: impl Into<String>) -> Self {
        Self {
            profile_id: profile_id.into(),
            integration_id: None,
            host: "local".to_string(),
            program: program.into(),
            args: Vec::new(),
            cwd: None,
            env: Vec::new(),
            stderr_capacity: 2 * 1024 * 1024,
        }
    }

    pub fn arg(mut self, arg: impl Into<String>) -> Self {
        self.args.push(arg.into());
        self
    }

    pub fn cwd(mut self, cwd: impl Into<PathBuf>) -> Self {
        self.cwd = Some(cwd.into());
        self
    }

    pub fn env(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.push((key.into(), value.into()));
        self
    }
}
