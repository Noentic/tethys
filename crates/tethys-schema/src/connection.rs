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

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct NormalizedCapabilities {
    pub load_session: bool,
    pub resume: bool,
    pub mcp: McpTransports,
    pub prompt_embedded_context: bool,
}

/// Per-profile ACP compatibility preferences (architecture §12).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AgentCompat {
    /// Preferred ACP version. `None` = probe (`ClientProtocolConnector`).
    pub preferred_protocol: Option<AcpProtocol>,
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
