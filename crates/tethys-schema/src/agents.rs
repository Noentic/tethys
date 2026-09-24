//! Agent profile, ACP-Registry and process-monitoring wire types (M1.12/M1.13).
//!
//! These are the UI-visible shapes behind the `agent.*` namespace. The profile
//! *store* row lives in `tethys-store`; these types are the resolved view the
//! Providers screen reads after merging the store with the last health check.
//! No secret ever appears here: an env value is a literal or a `keychain:…`
//! reference, never a resolved credential (G7).

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::connection::{AcpProtocol, NormalizedCapabilities};
use crate::sync::ProjectionTarget;

/// How a Provider's declared auth method is presented by the login surface.
///
/// ACP only distinguishes *terminal* (the client runs the vendor command) and
/// *agent* (the agent runs its own OAuth) auth, mapped to [`CliPassthrough`]
/// and [`AgentAuth`]. `env-var` and `url-code` are manual-profile shapes; an
/// unrecognised method id degrades to [`Unknown`], which the dialog renders as
/// a disabled row naming the id rather than breaking (spec §5.2).
///
/// [`CliPassthrough`]: AuthMethodShape::CliPassthrough
/// [`AgentAuth`]: AuthMethodShape::AgentAuth
/// [`Unknown`]: AuthMethodShape::Unknown
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "shape", rename_all = "kebab-case")]
pub enum AuthMethodShape {
    EnvVar,
    UrlCode,
    CliPassthrough,
    AgentAuth,
    Unknown { id: String },
}

/// One declared `authMethods` entry plus the shape the surface renders.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AuthMethodView {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub shape: AuthMethodShape,
    #[serde(default)]
    pub metadata: Option<String>,
}

/// Ephemeral credentials passed to an agent's declared authenticate method.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum AgentLoginInput {
    ApiKey {
        api_key: String,
    },
    Gateway {
        base_url: String,
        provider_name: Option<String>,
        #[serde(default)]
        headers: std::collections::BTreeMap<String, String>,
    },
}

/// Result of starting one declared ACP authentication method.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum AgentLoginOutcome {
    Complete,
    Terminal { terminal_id: String },
}

/// Current output and process state for a Terminal Auth session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LoginTerminalOutput {
    pub output: String,
    pub truncated: bool,
    pub exited: bool,
    pub exit_code: Option<u32>,
}

/// Current authentication state, independent of available authentication methods.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum AuthState {
    Unknown,
    Ready,
    Required,
}

/// Identity reported by a connection-scoped provider auth-status extension.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ProviderAuthStatus {
    pub kind: String,
    pub label: String,
    pub detail: Option<String>,
    pub email: Option<String>,
    pub organization: Option<String>,
    pub plan: Option<String>,
}

/// One environment binding: a literal or a `keychain:…` reference.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct EnvVarInput {
    pub key: String,
    pub value: String,
}

/// The launch inputs a profile owns (architecture §12).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LaunchSpecInput {
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub cwd: Option<String>,
    #[serde(default)]
    pub env: Vec<EnvVarInput>,
}

/// How a profile was created.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum BackendClass {
    Registry,
    Manual,
}

impl BackendClass {
    pub fn as_str(self) -> &'static str {
        match self {
            BackendClass::Registry => "registry",
            BackendClass::Manual => "manual",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "registry" => Some(BackendClass::Registry),
            "manual" => Some(BackendClass::Manual),
            _ => None,
        }
    }
}

/// A pinned registry install: which entry, at which version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct RegistryRef {
    pub id: String,
    pub version: String,
    /// The distribution form resolved at install time; absent on older rows.
    #[serde(default)]
    pub distribution: Option<String>,
}

/// Health of a profile's executable + ACP handshake (spec §5.2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderHealth {
    /// No check has completed yet.
    Unknown,
    Healthy,
    AuthRequired,
    /// Program not found on PATH or missing install (e.g. Node.js for `npx`).
    NotFound,
    Error,
}

/// In-flight state of the health poller for one Provider.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum RecheckStatus {
    Idle,
    Checking,
}

/// A profile merged with its last known health and negotiated capabilities.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct AgentProfileView {
    pub id: String,
    pub name: String,
    /// Stable provider identity, independent of registry install ownership.
    #[serde(default)]
    pub integration_id: Option<String>,
    pub class: BackendClass,
    pub enabled: bool,
    pub launch_spec: LaunchSpecInput,
    pub registry_ref: Option<RegistryRef>,
    pub projection_target: Option<ProjectionTarget>,
    pub preferred_protocol: Option<AcpProtocol>,
    pub health: ProviderHealth,
    pub auth_state: AuthState,
    #[serde(default)]
    pub provider_auth_status: Option<ProviderAuthStatus>,
    /// Human-readable reason for `health` (e.g. `needs Node.js`).
    pub detail: Option<String>,
    /// Protocol actually negotiated at the last handshake.
    pub protocol: Option<AcpProtocol>,
    pub capabilities: Option<NormalizedCapabilities>,
    pub auth_methods: Vec<AuthMethodView>,
    pub detected_version: Option<String>,
    pub latency_ms: Option<u32>,
    /// Unix milliseconds of the last completed check.
    pub last_checked_ms: Option<f64>,
    pub recheck: RecheckStatus,
}

/// Create/update input for a manual profile.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ProfileInput {
    /// `None` on create generates an id; on update identifies the row.
    pub id: Option<String>,
    pub name: String,
    pub launch_spec: LaunchSpecInput,
    pub projection_target: Option<ProjectionTarget>,
    pub preferred_protocol: Option<AcpProtocol>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

/// One installable ACP-Registry entry (`latest/registry.json`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AgentRegistryEntryView {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub repository: Option<String>,
    pub authors: Vec<String>,
    pub license: Option<String>,
    pub license_url: Option<String>,
    pub website: Option<String>,
    pub icon: Option<String>,
    pub preview_version: Option<String>,
    /// Distribution kinds the entry offers: `npx`, `binary`, `uvx`.
    pub distributions: Vec<String>,
    /// The server's deterministic current-host choice, if one is available.
    pub selected_distribution: Option<String>,
    pub needs_node: bool,
    pub needs_uvx: bool,
    pub selection_reason: Option<String>,
    pub install_block_reason: Option<String>,
    pub installed: bool,
    /// A compatible ACP command is already on the app's PATH and can be reused.
    #[serde(default)]
    pub system_available: bool,
    /// Setup guidance when a vendor CLI exists but its ACP server is missing.
    #[serde(default)]
    pub setup_note: Option<String>,
    pub pinned_version: Option<String>,
    pub update: Option<UpdateAvailability>,
    /// Vendor compliance note where the matrix has one (PRD §2).
    pub compliance_note: Option<String>,
}

/// Whether an upstream release is newer than a profile's pin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum UpdateAvailability {
    UpToDate,
    Available { latest: String },
}

/// The result of installing a registry entry into a profile.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct InstallResult {
    pub profile_id: String,
    pub version: String,
    pub distribution: String,
    pub selection_reason: Option<String>,
    pub launch_spec: LaunchSpecInput,
    /// Set when an optional integrity field was absent (`sha256`).
    pub warning: Option<String>,
    /// True when an `npx` install needs Node.js that is not on PATH.
    pub needs_node: bool,
    /// True when an `uvx` install needs uv that is not on PATH.
    pub needs_uvx: bool,
}

/// One process in a thread's tree (architecture §7.5).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct ProcessSample {
    pub pid: u32,
    /// CPU usage in percent of one core, summed for the tree on the leader row.
    pub cpu: f32,
    /// Resident set size in bytes.
    pub rss: f64,
    pub uptime_secs: u32,
    /// Coarse process state (`run`, `sleep`, …).
    pub state: String,
    /// True for the process-group leader (the connection's `pid`).
    pub leader: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn round_trip<T>(value: &T)
    where
        T: Serialize + for<'de> Deserialize<'de> + PartialEq + std::fmt::Debug,
    {
        let json = serde_json::to_string(value).expect("serialize");
        let parsed: T = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(&parsed, value);
    }

    #[test]
    fn shapes_round_trip() {
        for shape in [
            AuthMethodShape::EnvVar,
            AuthMethodShape::UrlCode,
            AuthMethodShape::CliPassthrough,
            AuthMethodShape::AgentAuth,
            AuthMethodShape::Unknown {
                id: "custom".into(),
            },
        ] {
            round_trip(&shape);
        }
    }

    #[test]
    fn shape_spellings_are_kebab_case() {
        let value = serde_json::to_value(AuthMethodShape::CliPassthrough).expect("serialize");
        assert_eq!(value, serde_json::json!({ "shape": "cli-passthrough" }));
    }

    #[test]
    fn profile_view_round_trips_with_nulls() {
        let view = AgentProfileView {
            id: "manual-1".into(),
            name: "Manual".into(),
            integration_id: None,
            class: BackendClass::Manual,
            enabled: true,
            launch_spec: LaunchSpecInput {
                program: "my-agent".into(),
                args: vec!["acp".into()],
                cwd: None,
                env: vec![EnvVarInput {
                    key: "API_KEY".into(),
                    value: "keychain:profiles/manual-1/API_KEY".into(),
                }],
            },
            registry_ref: None,
            projection_target: None,
            preferred_protocol: Some(AcpProtocol::V2),
            health: ProviderHealth::Unknown,
            auth_state: AuthState::Unknown,
            provider_auth_status: None,
            detail: None,
            protocol: None,
            capabilities: None,
            auth_methods: vec![],
            detected_version: None,
            latency_ms: None,
            last_checked_ms: None,
            recheck: RecheckStatus::Idle,
        };
        round_trip(&view);
    }

    #[test]
    fn update_availability_is_tagged() {
        let value = serde_json::to_value(UpdateAvailability::Available {
            latest: "1.3.0".into(),
        })
        .expect("serialize");
        assert_eq!(
            value,
            serde_json::json!({ "kind": "available", "latest": "1.3.0" })
        );
        round_trip(&UpdateAvailability::UpToDate);
    }
}
