//! Agent connection contract types (architecture §12).
//!
//! The store lives in `tethys-agent-servers`; these are the wire/UI-visible
//! pieces so `agent.connections.*` can return typed rows.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::sync::McpTransports;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
pub enum AcpProtocol {
    V1,
    V2,
}

/// Connection state as exposed to the UI (architecture §12). `Terminated` is
/// an internal store state and is never reported.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum ConnectionState {
    Connecting,
    Connected,
    Error,
    Draining,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AgentInfo {
    pub name: String,
    pub version: String,
    pub title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct NormalizedCapabilities {
    pub load_session: bool,
    pub resume: bool,
    #[serde(default)]
    pub close_session: bool,
    #[serde(default)]
    pub list_sessions: bool,
    #[serde(default)]
    pub delete_session: bool,
    #[serde(default)]
    pub logout: bool,
    pub mcp: McpTransports,
    /// ACP requires every agent to accept text prompts.
    #[serde(default = "capability_enabled")]
    pub prompt_text: bool,
    /// ACP requires every agent to accept resource links in prompts.
    #[serde(default = "capability_enabled")]
    pub prompt_resource_link: bool,
    #[serde(default)]
    pub prompt_image: bool,
    #[serde(default)]
    pub prompt_audio: bool,
    pub prompt_embedded_context: bool,
    /// Whether Tethys advertised form elicitation and may receive
    /// `elicitation/create` for this connection (M1.7). An agent that never
    /// sends elicitation requests never materializes an entry.
    #[serde(default)]
    pub elicitation: bool,
    #[serde(default)]
    pub session_fork: bool,
    #[serde(default)]
    pub provider_extensions: ProviderExtensionCapabilities,
}

/// Provider extension features the client and agent both negotiated.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ProviderExtensionCapabilities {
    #[serde(default)]
    pub goal_actions: Vec<String>,
    #[serde(default)]
    pub steering: bool,
    #[serde(default)]
    pub async_tasks: bool,
    #[serde(default)]
    pub native_subagents: bool,
    #[serde(default)]
    pub file_change_report: bool,
    #[serde(default)]
    pub auth_status: bool,
    #[serde(default)]
    pub provider_routing: bool,
    #[serde(default)]
    pub gateway_auth: bool,
}

fn capability_enabled() -> bool {
    true
}

impl Default for NormalizedCapabilities {
    fn default() -> Self {
        Self {
            load_session: false,
            resume: false,
            close_session: false,
            list_sessions: false,
            delete_session: false,
            logout: false,
            mcp: McpTransports::default(),
            prompt_text: true,
            prompt_resource_link: true,
            prompt_image: false,
            prompt_audio: false,
            prompt_embedded_context: false,
            elicitation: false,
            session_fork: false,
            provider_extensions: ProviderExtensionCapabilities::default(),
        }
    }
}

/// Per-profile ACP compatibility preferences (architecture §12).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AgentCompat {
    /// Preferred ACP version. `None` = probe (`ClientProtocolConnector`).
    pub preferred_protocol: Option<AcpProtocol>,
    #[serde(default)]
    pub projection_target: Option<crate::sync::ProjectionTarget>,
}

/// ConnectionStore row identity: one connection per profile and host.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
pub struct ConnectionKey {
    pub profile_id: String,
    pub host: String,
}

impl ConnectionKey {
    pub fn new(profile_id: impl Into<String>, host: impl Into<String>) -> Self {
        Self {
            profile_id: profile_id.into(),
            host: host.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ConnectionEntry {
    pub key: ConnectionKey,
    pub state: ConnectionState,
    pub protocol: Option<AcpProtocol>,
    pub info: Option<AgentInfo>,
    pub capabilities: Option<NormalizedCapabilities>,
    pub pid: Option<u32>,
    pub restarts: u32,
    pub stale: bool,
}
