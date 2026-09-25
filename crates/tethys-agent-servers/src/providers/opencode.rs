//! OpenCode provider integration and system launch detection.

use tethys_acp::client::AcpProviderIntegration;
use tethys_schema::agents::{EnvVarInput, LaunchSpecInput};

pub const REGISTRY_ID: &str = "opencode";

/// OpenCode speaks standard ACP v1 with no wire extensions. Its todo and
/// question tools arrive as plain tool calls; the shared mapper names their
/// surface from the input and turns a todo write into a plan
/// (`tethys_acp::surface`), so no hook is needed here.
pub fn descriptor() -> AcpProviderIntegration {
    AcpProviderIntegration {
        id: REGISTRY_ID.into(),
        ..Default::default()
    }
}

/// Detects an existing OpenCode binary on the system PATH and returns its ACP launch spec.
pub fn system_launch_spec() -> Option<LaunchSpecInput> {
    Some(LaunchSpecInput {
        program: which::which("opencode")
            .ok()?
            .to_string_lossy()
            .into_owned(),
        args: vec!["acp".to_string()],
        cwd: None,
        env: Vec::<EnvVarInput>::new(),
    })
}

/// Setup note for OpenCode. OpenCode natively supports ACP via `opencode acp`, so no extra adapter is required.
pub fn setup_note() -> Option<String> {
    None
}
