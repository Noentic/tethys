//! Install a registry entry into a pinned `LaunchSpec`, with opt-in updates.
//!
//! `latest/registry.json` carries only the *current* version, so pinning
//! cannot re-fetch the old entry: the resolved spec is stored at install time
//! and the pin survives an upstream release. An update re-resolves on request.

use std::io::{Cursor, Write};
use std::path::{Component, Path, PathBuf};

use sha2::{Digest, Sha256};
use tethys_schema::agents::{EnvVarInput, LaunchSpecInput, RegistryRef, UpdateAvailability};

use super::model::{BinaryTarget, Distribution, RegistryAgent};
use super::platform;
use super::RegistryError;

/// How an install locates and pins its artifacts.
#[derive(Debug, Clone)]
pub struct InstallOptions {
    /// Parent directory for per-profile installs.
    pub install_root: PathBuf,
    /// Override the registry platform key (tests); `None` probes the host.
    pub platform: Option<String>,
    /// Whether `npx` is available; `None` probes PATH.
    pub node_present: Option<bool>,
    /// Whether `uvx` is available; `None` probes PATH.
    pub uv_present: Option<bool>,
}

/// A resolved, pinned install ready to persist as a profile.
#[derive(Debug, Clone, PartialEq)]
pub struct InstallOutcome {
    pub profile_id: String,
    pub name: String,
    pub launch_spec: LaunchSpecInput,
    pub registry_ref: RegistryRef,
    pub distribution: String,
    pub selection_reason: Option<String>,
    /// Set when an optional integrity field was absent.
    pub warning: Option<String>,
    pub needs_node: bool,
    pub needs_uvx: bool,
}

/// Current-host choice shared by registry listing and installation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DistributionSelection {
    pub kind: String,
    pub needs_node: bool,
    pub needs_uvx: bool,
    pub reason: Option<String>,
}

/// Chooses a supported registry form in the documented deterministic order.
pub fn select_distribution(
    distribution: &Distribution,
    platform_key: Option<&str>,
    node_present: bool,
    uv_present: bool,
) -> Result<DistributionSelection, RegistryError> {
    let mut unavailable = Vec::new();
    if let Some(targets) = &distribution.binary {
        if platform_key.is_some_and(|key| targets.contains_key(key)) {
            return Ok(DistributionSelection {
                kind: "binary".to_string(),
                needs_node: false,
                needs_uvx: false,
                reason: None,
            });
        }
        unavailable.push(format!(
            "binary has no target for {}",
            platform_key.unwrap_or("this platform")
        ));
    }
    if distribution.npx.is_some() {
        if node_present {
            return Ok(DistributionSelection {
                kind: "npx".to_string(),
                needs_node: false,
                needs_uvx: false,
                reason: reason_from(&unavailable),
            });
        }
        unavailable.push("npx requires Node.js (`npx` is not on PATH)".to_string());
    }
    if distribution.uvx.is_some() {
        if uv_present {
            return Ok(DistributionSelection {
                kind: "uvx".to_string(),
                needs_node: false,
                needs_uvx: false,
                reason: reason_from(&unavailable),
            });
        }
        unavailable.push("uvx requires uv (`uvx` is not on PATH)".to_string());
    }
    if distribution.npx.is_some() {
        return Ok(DistributionSelection {
            kind: "npx".to_string(),
            needs_node: true,
            needs_uvx: false,
            reason: reason_from(&unavailable),
        });
    }
    if distribution.uvx.is_some() {
        return Ok(DistributionSelection {
            kind: "uvx".to_string(),
            needs_node: false,
            needs_uvx: true,
            reason: reason_from(&unavailable),
        });
    }
    if distribution.binary.is_some() {
        return Err(RegistryError::UnsupportedPlatform(
            platform_key.unwrap_or("unknown platform").to_string(),
        ));
    }
    Err(RegistryError::UnsupportedDistribution("empty".to_string()))
}

fn reason_from(unavailable: &[String]) -> Option<String> {
    (!unavailable.is_empty()).then(|| unavailable.join("; "))
}

/// Vendor compliance notes where the matrix has one (PRD §2).
pub fn compliance_note(id: &str) -> Option<&'static str> {
    match id {
        "antigravity-acp" => Some(
            "Antigravity terms forbid third-party tools accessing the service; \
             off the release path until a compliance determination is made.",
        ),
        _ => None,
    }
}

/// Resolves one registry agent into an install outcome.
pub async fn install(
    agent: &RegistryAgent,
    requested_version: Option<&str>,
    options: &InstallOptions,
) -> Result<InstallOutcome, RegistryError> {
    if let Some(requested) = requested_version {
        if requested != agent.version {
            return Err(RegistryError::VersionUnavailable {
                id: agent.id.clone(),
                requested: requested.to_string(),
            });
        }
    }

    let registry_ref = RegistryRef {
        id: agent.id.clone(),
        version: agent.version.clone(),
        distribution: None,
    };

    let platform_key = options
        .platform
        .as_deref()
        .or(platform::host_platform_key());
    let node_present = options
        .node_present
        .unwrap_or_else(|| which::which("npx").is_ok());
    let uv_present = options
        .uv_present
        .unwrap_or_else(|| which::which("uvx").is_ok());
    let selection =
        select_distribution(&agent.distribution, platform_key, node_present, uv_present).map_err(
            |error| match error {
                RegistryError::UnsupportedPlatform(_) if platform_key.is_none() => {
                    RegistryError::UnsupportedPlatform(host_label())
                }
                other => other,
            },
        )?;
    if selection.kind == "binary" {
        let key = platform_key.ok_or_else(|| RegistryError::UnsupportedPlatform(host_label()))?;
        let target = agent
            .distribution
            .binary
            .as_ref()
            .and_then(|targets| targets.get(key))
            .ok_or_else(|| RegistryError::UnsupportedPlatform(key.to_string()))?;
        let install_dir = options.install_root.join(safe_dir(&agent.id));
        let mut outcome = install_binary(agent, &registry_ref, target, key, &install_dir).await?;
        outcome.selection_reason = selection.reason;
        return Ok(outcome);
    }
    let (package, args) = if selection.kind == "npx" {
        let npx = agent
            .distribution
            .npx
            .as_ref()
            .ok_or_else(|| RegistryError::UnsupportedDistribution("npx".to_string()))?;
        (&npx.package, &npx.args)
    } else {
        let uvx = agent
            .distribution
            .uvx
            .as_ref()
            .ok_or_else(|| RegistryError::UnsupportedDistribution("uvx".to_string()))?;
        (&uvx.package, &uvx.args)
    };
    let mut outcome = runtime_outcome(
        agent,
        registry_ref,
        &selection.kind,
        package,
        args,
        selection.needs_node,
        selection.needs_uvx,
    );
    outcome.selection_reason = selection.reason;
    Ok(outcome)
}

fn runtime_outcome(
    agent: &RegistryAgent,
    registry_ref: RegistryRef,
    distribution: &str,
    package: &str,
    extra_args: &[String],
    needs_node: bool,
    needs_uvx: bool,
) -> InstallOutcome {
    let mut registry_ref = registry_ref;
    registry_ref.distribution = Some(distribution.to_string());
    let mut args = if distribution == "npx" {
        vec!["-y".to_string(), package.to_string()]
    } else {
        vec![package.to_string()]
    };
    args.extend(extra_args.iter().cloned());
    InstallOutcome {
        profile_id: agent.id.clone(),
        name: agent.name.clone(),
        launch_spec: LaunchSpecInput {
            program: distribution.to_string(),
            args,
            cwd: None,
            env: Vec::new(),
        },
        registry_ref,
        distribution: distribution.to_string(),
        selection_reason: None,
        warning: None,
        needs_node,
        needs_uvx,
    }
}

async fn install_binary(
    agent: &RegistryAgent,
    registry_ref: &RegistryRef,
    target: &BinaryTarget,
    platform_key: &str,
    install_dir: &Path,
) -> Result<InstallOutcome, RegistryError> {
    let command_path = safe_command_path(&target.cmd)?;
    let bytes = download(&target.archive).await?;

    let mut warning = None;
    match &target.sha256 {
        Some(expected) => {
            let actual = hex(&Sha256::digest(&bytes));
            if !actual.eq_ignore_ascii_case(expected) {
                return Err(RegistryError::Integrity {
                    expected: expected.clone(),
                    actual,
                });
            }
        }
        None => {
            warning = Some(format!(
                "No sha256 published for {platform_key}; integrity unverified."
            ));
        }
    }

    let install_root = install_dir
        .parent()
        .ok_or_else(|| RegistryError::Install("install path has no parent".to_string()))?;
    std::fs::create_dir_all(install_root)
        .map_err(|error| RegistryError::Install(error.to_string()))?;
    let staging = tempfile::Builder::new()
        .prefix(".provider-install-")
        .tempdir_in(install_root)
        .map_err(|error| RegistryError::Install(error.to_string()))?;
    let staged_root = staging.path().join("payload");
    std::fs::create_dir(&staged_root).map_err(|error| RegistryError::Install(error.to_string()))?;
    extract(&bytes, &target.archive, &staged_root, &command_path)?;

    let staged_program = staged_root.join(&command_path);
    if !staged_program.is_file() {
        return Err(RegistryError::Install(format!(
            "archive did not contain {}",
            target.cmd
        )));
    }
    make_executable(&staged_program)?;

    let backup = tempfile::Builder::new()
        .prefix(".provider-backup-")
        .tempdir_in(install_root)
        .map_err(|error| RegistryError::Install(error.to_string()))?;
    let backup_path = backup.path().join("previous");
    let had_previous = std::fs::symlink_metadata(install_dir).is_ok();
    if had_previous {
        std::fs::rename(install_dir, &backup_path)
            .map_err(|error| RegistryError::Install(error.to_string()))?;
    }
    if let Err(error) = std::fs::rename(&staged_root, install_dir) {
        if had_previous {
            let _ = std::fs::rename(&backup_path, install_dir);
        }
        return Err(RegistryError::Install(error.to_string()));
    }
    if had_previous {
        if let Err(error) = remove_path(&backup_path) {
            warning = Some(match warning {
                Some(existing) => format!("{existing} Previous install cleanup failed: {error}"),
                None => format!("Previous install cleanup failed: {error}"),
            });
        }
    }
    let program = install_dir.join(command_path);

    Ok(InstallOutcome {
        profile_id: agent.id.clone(),
        name: agent.name.clone(),
        launch_spec: LaunchSpecInput {
            program: program.display().to_string(),
            args: target.args.clone(),
            cwd: None,
            env: target
                .env
                .iter()
                .map(|(key, value)| EnvVarInput {
                    key: key.clone(),
                    value: value.clone(),
                })
                .collect(),
        },
        registry_ref: RegistryRef {
            distribution: Some("binary".to_string()),
            ..registry_ref.clone()
        },
        distribution: "binary".to_string(),
        selection_reason: None,
        warning,
        needs_node: false,
        needs_uvx: false,
    })
}

async fn download(url: &str) -> Result<Vec<u8>, RegistryError> {
    let client = reqwest::Client::builder()
        .build()
        .map_err(|error| RegistryError::Fetch(error.to_string()))?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| RegistryError::Fetch(error.to_string()))?;
    if !response.status().is_success() {
        return Err(RegistryError::Fetch(format!(
            "{url} returned {}",
            response.status()
        )));
    }
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|error| RegistryError::Fetch(error.to_string()))
}

fn extract(bytes: &[u8], archive: &str, dest: &Path, command: &Path) -> Result<(), RegistryError> {
    if archive.ends_with(".zip") {
        let mut zip = zip::ZipArchive::new(Cursor::new(bytes))
            .map_err(|error| RegistryError::Install(error.to_string()))?;
        for index in 0..zip.len() {
            let mut entry = zip
                .by_index(index)
                .map_err(|error| RegistryError::Install(error.to_string()))?;
            let Some(path) = entry.enclosed_name() else {
                return Err(RegistryError::Install(format!(
                    "archive entry {} escapes the install dir",
                    entry.name()
                )));
            };
            let out = dest.join(path);
            if entry.is_dir() {
                std::fs::create_dir_all(&out)
                    .map_err(|error| RegistryError::Install(error.to_string()))?;
                continue;
            }
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|error| RegistryError::Install(error.to_string()))?;
            }
            let mut file = std::fs::File::create(&out)
                .map_err(|error| RegistryError::Install(error.to_string()))?;
            std::io::copy(&mut entry, &mut file)
                .map_err(|error| RegistryError::Install(error.to_string()))?;
        }
        return Ok(());
    }
    if archive.ends_with(".tar.gz") || archive.ends_with(".tgz") {
        let decoder = flate2::read::GzDecoder::new(Cursor::new(bytes));
        let mut tar = tar::Archive::new(decoder);
        tar.unpack(dest)
            .map_err(|error| RegistryError::Install(error.to_string()))?;
        return Ok(());
    }
    if archive.ends_with(".tar.bz2") || archive.ends_with(".tbz2") {
        let decoder = bzip2::read::BzDecoder::new(Cursor::new(bytes));
        let mut tar = tar::Archive::new(decoder);
        tar.unpack(dest)
            .map_err(|error| RegistryError::Install(error.to_string()))?;
        return Ok(());
    }
    let out = dest.join(command);
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| RegistryError::Install(error.to_string()))?;
    }
    let mut file =
        std::fs::File::create(out).map_err(|error| RegistryError::Install(error.to_string()))?;
    file.write_all(bytes)
        .map_err(|error| RegistryError::Install(error.to_string()))
}

fn safe_command_path(command: &str) -> Result<PathBuf, RegistryError> {
    if command.contains('\\') || command.contains('\0') {
        return Err(RegistryError::Install("invalid command path".to_string()));
    }
    let path = Path::new(command.strip_prefix("./").unwrap_or(command));
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(RegistryError::Install(format!(
            "command path must stay inside install directory: {command}"
        )));
    }
    Ok(path.to_path_buf())
}

fn remove_path(path: &Path) -> std::io::Result<()> {
    let metadata = std::fs::symlink_metadata(path)?;
    if metadata.file_type().is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    }
}

#[cfg(unix)]
fn make_executable(path: &Path) -> Result<(), RegistryError> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = std::fs::metadata(path)
        .map_err(|error| RegistryError::Install(error.to_string()))?
        .permissions();
    permissions.set_mode(0o755);
    std::fs::set_permissions(path, permissions)
        .map_err(|error| RegistryError::Install(error.to_string()))
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> Result<(), RegistryError> {
    Ok(())
}

/// Compares a stored pin with the registry's current version (semver).
pub fn update_availability(pinned: &str, current: &str) -> UpdateAvailability {
    match (
        semver::Version::parse(pinned).ok(),
        semver::Version::parse(current).ok(),
    ) {
        (Some(pinned), Some(current)) if current > pinned => UpdateAvailability::Available {
            latest: current.to_string(),
        },
        (Some(_), Some(_)) => UpdateAvailability::UpToDate,
        // An unparseable version cannot be ordered; report up-to-date unless it
        // differs, in which case surface it as an available update.
        _ if pinned != current => UpdateAvailability::Available {
            latest: current.to_string(),
        },
        _ => UpdateAvailability::UpToDate,
    }
}

fn host_label() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

fn safe_dir(id: &str) -> String {
    id.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver_update_detection() {
        assert_eq!(
            update_availability("1.2.0", "1.3.0"),
            UpdateAvailability::Available {
                latest: "1.3.0".into()
            }
        );
        assert_eq!(
            update_availability("1.2.0", "1.2.0"),
            UpdateAvailability::UpToDate
        );
        assert_eq!(
            update_availability("1.2.0", "1.1.0"),
            UpdateAvailability::UpToDate
        );
    }

    #[test]
    fn safe_dir_strips_path_separators() {
        assert_eq!(safe_dir("a/b\\c"), "a_b_c");
        assert_eq!(safe_dir("claude-acp"), "claude-acp");
    }

    #[test]
    fn compliance_note_is_present_for_antigravity_only() {
        assert!(compliance_note("antigravity-acp").is_some());
        assert!(compliance_note("opencode").is_none());
    }
}
