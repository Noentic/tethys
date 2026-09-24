//! Agent-profile <-> store-row mapping (M1.12 U1/U6).
//!
//! The store keeps `launch_spec`/`registry_ref` as JSON text; these helpers are
//! the one place the two representations meet.

use std::path::PathBuf;

use tethys_agent_servers::LaunchSpec;
use tethys_schema::agents::{BackendClass, LaunchSpecInput, ProfileInput, RegistryRef};
use tethys_schema::connection::{AcpProtocol, AgentCompat};
use tethys_schema::sync::ProjectionTarget;
use tethys_store::AgentProfileRow;

use crate::ApiError;

/// Builds a `LaunchSpec` from a stored/input launch spec.
pub fn spec_from_input(
    profile_id: &str,
    input: &LaunchSpecInput,
    integration_id: Option<&str>,
) -> LaunchSpec {
    let mut spec = LaunchSpec::new(profile_id, input.program.clone());
    spec.integration_id = integration_id.map(str::to_string);
    spec.args = input.args.clone();
    spec.cwd = input.cwd.as_ref().map(PathBuf::from);
    spec.env = input
        .env
        .iter()
        .map(|env| (env.key.clone(), env.value.clone()))
        .collect();
    spec
}

/// Builds the ACP compatibility preferences from a stored row.
pub fn compat_from_row(row: &AgentProfileRow) -> AgentCompat {
    AgentCompat {
        preferred_protocol: row.preferred_protocol.as_deref().and_then(parse_protocol),
        projection_target: row
            .projection_target
            .as_deref()
            .and_then(ProjectionTarget::parse),
    }
}

fn parse_protocol(value: &str) -> Option<AcpProtocol> {
    match value {
        "V1" => Some(AcpProtocol::V1),
        "V2" => Some(AcpProtocol::V2),
        _ => None,
    }
}

/// The `LaunchSpecInput` persisted in a stored row.
pub fn input_from_row(row: &AgentProfileRow) -> Result<LaunchSpecInput, ApiError> {
    serde_json::from_str(&row.launch_spec)
        .map_err(|error| ApiError::Internal(format!("invalid launch spec: {error}")))
}

/// The `RegistryRef` persisted in a stored row, if any.
pub fn registry_ref_from_row(row: &AgentProfileRow) -> Result<Option<RegistryRef>, ApiError> {
    match &row.registry_ref {
        Some(json) => serde_json::from_str(json)
            .map(Some)
            .map_err(|error| ApiError::Internal(format!("invalid registry ref: {error}"))),
        None => Ok(None),
    }
}

/// Resolves provider identity from explicit identity, registry ownership, or
/// an exact known ACP executable name. Custom commands stay unclassified.
pub fn integration_id_from_row(row: &AgentProfileRow) -> Result<Option<String>, ApiError> {
    if let Some(integration_id) = &row.integration_id {
        return Ok(Some(integration_id.clone()));
    }
    if let Some(reference) = registry_ref_from_row(row)? {
        return Ok(Some(reference.id));
    }
    let input = input_from_row(row)?;
    let program = PathBuf::from(input.program);
    let name = program
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    let normalized = name.strip_suffix(".exe").unwrap_or(name);
    Ok((normalized.eq_ignore_ascii_case("codex-acp")).then(|| "codex-acp".into()))
}

/// Reuses a profile's settings while switching it to a discovered ACP program.
pub fn launch_spec_for_system(
    current: Option<LaunchSpecInput>,
    detected: LaunchSpecInput,
) -> LaunchSpecInput {
    let Some(mut current) = current else {
        return detected;
    };
    current.program = detected.program;
    current.args = detected.args;
    current
}

/// Reuses a configured profile while changing its active launch to a detected system adapter.
pub fn system_profile_from_existing(
    existing: &AgentProfileRow,
    integration_id: &str,
    detected: LaunchSpecInput,
) -> Result<AgentProfileRow, ApiError> {
    let current = input_from_row(existing)?;
    let launch_spec = launch_spec_for_system(Some(current), detected);
    let compat = compat_from_row(existing);
    row_from_input(ProfileDraft {
        id: existing.id.clone(),
        name: &existing.name,
        class: BackendClass::Manual,
        launch_spec: &launch_spec,
        registry_ref: None,
        integration_id: Some(integration_id),
        projection_target: compat.projection_target,
        preferred_protocol: compat.preferred_protocol,
        enabled: existing.enabled,
    })
}

/// Everything a stored profile row is built from.
pub struct ProfileDraft<'a> {
    pub id: String,
    pub name: &'a str,
    pub class: BackendClass,
    pub launch_spec: &'a LaunchSpecInput,
    pub registry_ref: Option<&'a RegistryRef>,
    pub integration_id: Option<&'a str>,
    pub projection_target: Option<ProjectionTarget>,
    pub preferred_protocol: Option<AcpProtocol>,
    pub enabled: bool,
}

/// Converts a create/update input into a stored row.
pub fn row_from_input(draft: ProfileDraft<'_>) -> Result<AgentProfileRow, ApiError> {
    let ProfileDraft {
        id,
        name,
        class,
        launch_spec: input,
        registry_ref,
        integration_id,
        projection_target,
        preferred_protocol,
        enabled,
    } = draft;
    Ok(AgentProfileRow {
        id,
        name: name.to_string(),
        class: class.as_str().to_string(),
        launch_spec: serde_json::to_string(input)
            .map_err(|error| ApiError::Internal(error.to_string()))?,
        registry_ref: match registry_ref {
            Some(reference) => Some(
                serde_json::to_string(reference)
                    .map_err(|error| ApiError::Internal(error.to_string()))?,
            ),
            None => None,
        },
        integration_id: integration_id.map(str::to_string),
        projection_target: projection_target.map(|target| target.as_str().to_string()),
        preferred_protocol: preferred_protocol.map(|protocol| match protocol {
            AcpProtocol::V1 => "V1".to_string(),
            AcpProtocol::V2 => "V2".to_string(),
        }),
        enabled,
    })
}

/// A generated profile id for a manual profile without an explicit id.
pub fn generated_id(name: &str) -> String {
    let slug: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = slug.trim_matches('-');
    if trimmed.is_empty() {
        "manual-profile".to_string()
    } else {
        format!("manual-{trimmed}")
    }
}

/// Classifies a profile input as registry- or manually-created.
pub fn class_for(
    existing: Option<&AgentProfileRow>,
    registry_ref: Option<&RegistryRef>,
) -> BackendClass {
    if let Some(row) = existing {
        if let Some(class) = BackendClass::parse(&row.class) {
            return class;
        }
    }
    if registry_ref.is_some() {
        BackendClass::Registry
    } else {
        BackendClass::Manual
    }
}

/// Parses the class stored on a row, defaulting to `manual`.
pub fn class_from_row(row: &AgentProfileRow) -> BackendClass {
    BackendClass::parse(&row.class).unwrap_or(BackendClass::Manual)
}

/// Applies a profile input's mutable fields onto a row.
pub fn apply_input(row: &mut AgentProfileRow, input: &ProfileInput) -> Result<(), ApiError> {
    row.name = input.name.clone();
    row.launch_spec = serde_json::to_string(&input.launch_spec)
        .map_err(|error| ApiError::Internal(error.to_string()))?;
    row.projection_target = input
        .projection_target
        .map(|target| target.as_str().to_string());
    row.preferred_protocol = input.preferred_protocol.map(|protocol| match protocol {
        AcpProtocol::V1 => "V1".to_string(),
        AcpProtocol::V2 => "V2".to_string(),
    });
    row.enabled = input.enabled;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tethys_schema::agents::EnvVarInput;

    fn launch() -> LaunchSpecInput {
        LaunchSpecInput {
            program: "my-agent".into(),
            args: vec!["acp".into()],
            cwd: None,
            env: vec![EnvVarInput {
                key: "API_KEY".into(),
                value: "keychain:profiles/p/API_KEY".into(),
            }],
        }
    }

    #[test]
    fn launch_spec_round_trips_through_a_row() {
        let row = row_from_input(ProfileDraft {
            id: "p".into(),
            name: "P",
            class: BackendClass::Manual,
            launch_spec: &launch(),
            registry_ref: None,
            integration_id: None,
            projection_target: None,
            preferred_protocol: Some(AcpProtocol::V2),
            enabled: true,
        })
        .expect("row");
        assert_eq!(input_from_row(&row).expect("input"), launch());
        assert_eq!(registry_ref_from_row(&row).expect("ref"), None);
    }

    #[test]
    fn projection_and_protocol_survive_the_round_trip() {
        let row = row_from_input(ProfileDraft {
            id: "p".into(),
            name: "P",
            class: BackendClass::Registry,
            launch_spec: &launch(),
            registry_ref: Some(&RegistryRef {
                id: "opencode".into(),
                version: "1.0.0".into(),
                distribution: Some("binary".into()),
            }),
            integration_id: Some("opencode"),
            projection_target: Some(ProjectionTarget::ClaudeCode),
            preferred_protocol: Some(AcpProtocol::V1),
            enabled: true,
        })
        .expect("row");
        assert_eq!(
            registry_ref_from_row(&row).expect("ref"),
            Some(RegistryRef {
                id: "opencode".into(),
                version: "1.0.0".into(),
                distribution: Some("binary".into()),
            })
        );
        assert_eq!(row.projection_target.as_deref(), Some("claude-code"));
        assert_eq!(
            compat_from_row(&row).preferred_protocol,
            Some(AcpProtocol::V1)
        );
    }

    #[test]
    fn system_launch_replaces_only_the_executable_and_arguments() {
        let current = LaunchSpecInput {
            program: "/old/codex-acp".into(),
            args: vec!["--stale".into()],
            cwd: Some("/workspace".into()),
            env: launch().env,
        };
        let detected = LaunchSpecInput {
            program: "/new/codex-acp".into(),
            args: vec!["--stdio".into()],
            cwd: None,
            env: Vec::new(),
        };

        let switched = launch_spec_for_system(Some(current.clone()), detected);

        assert_eq!(switched.program, "/new/codex-acp");
        assert_eq!(switched.args, ["--stdio"]);
        assert_eq!(switched.cwd, current.cwd);
        assert_eq!(switched.env, current.env);
    }

    #[test]
    fn existing_system_profile_keeps_user_settings_and_drops_registry_ownership() {
        let current = LaunchSpecInput {
            program: "/old/codex-acp".into(),
            args: vec!["--stale".into()],
            cwd: Some("/workspace".into()),
            env: launch().env,
        };
        let row = row_from_input(ProfileDraft {
            id: "codex-work".into(),
            name: "Work Codex",
            class: BackendClass::Registry,
            launch_spec: &current,
            registry_ref: Some(&RegistryRef {
                id: "codex-acp".into(),
                version: "0.1.0".into(),
                distribution: Some("npm".into()),
            }),
            integration_id: Some("codex-acp"),
            projection_target: Some(ProjectionTarget::ClaudeCode),
            preferred_protocol: Some(AcpProtocol::V2),
            enabled: false,
        })
        .expect("existing profile");

        let updated = system_profile_from_existing(
            &row,
            "codex-acp",
            LaunchSpecInput {
                program: "/system/codex-acp".into(),
                args: vec!["--stdio".into()],
                cwd: None,
                env: Vec::new(),
            },
        )
        .expect("system profile");
        let launch_spec = input_from_row(&updated).expect("launch spec");

        assert_eq!(updated.id, row.id);
        assert_eq!(updated.name, row.name);
        assert_eq!(updated.class, BackendClass::Manual.as_str());
        assert_eq!(updated.integration_id.as_deref(), Some("codex-acp"));
        assert_eq!(updated.registry_ref, None);
        assert_eq!(updated.projection_target, row.projection_target);
        assert_eq!(updated.preferred_protocol, row.preferred_protocol);
        assert_eq!(updated.enabled, row.enabled);
        assert_eq!(launch_spec.program, "/system/codex-acp");
        assert_eq!(launch_spec.args, ["--stdio"]);
        assert_eq!(launch_spec.cwd, Some("/workspace".into()));
        assert_eq!(launch_spec.env, current.env);
    }

    #[test]
    fn generated_ids_are_slugged() {
        assert_eq!(generated_id("My Agent!"), "manual-my-agent");
        assert_eq!(generated_id(""), "manual-profile");
    }
}
