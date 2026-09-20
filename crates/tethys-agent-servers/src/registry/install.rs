//! Install a registry entry into a pinned `LaunchSpec`, with opt-in updates.
//!
//! `latest/registry.json` carries only the *current* version, so pinning
//! cannot re-fetch the old entry: the resolved spec is stored at install time
//! and the pin survives an upstream release. An update re-resolves on request.

use std::io::Cursor;
use std::path::{Path, PathBuf};

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
}

/// A resolved, pinned install ready to persist as a profile.
#[derive(Debug, Clone, PartialEq)]
pub struct InstallOutcome {
    pub profile_id: String,
    pub name: String,
    pub launch_spec: LaunchSpecInput,
    pub registry_ref: RegistryRef,
    /// Set when an optional integrity field was absent.
    pub warning: Option<String>,
    pub needs_node: bool,
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
    };

    match &agent.distribution {
        Distribution::Npx(npx) => {
            let mut args = vec!["-y".to_string(), npx.package.clone()];
            args.extend(npx.args.iter().cloned());
            let node_present = options
                .node_present
                .unwrap_or_else(|| which::which("npx").is_ok());
            Ok(InstallOutcome {
                profile_id: agent.id.clone(),
                name: agent.name.clone(),
                launch_spec: LaunchSpecInput {
                    program: "npx".to_string(),
                    args,
                    cwd: None,
                    env: Vec::new(),
                },
                registry_ref,
                warning: None,
                needs_node: !node_present,
            })
        }
        Distribution::Uvx(_) => Err(RegistryError::UnsupportedDistribution("uvx".to_string())),
        Distribution::Binary(targets) => {
            let key = match options.platform.as_deref() {
                Some(key) => key.to_string(),
                None => platform::host_platform_key()
                    .ok_or_else(|| RegistryError::UnsupportedPlatform(host_label()))?
                    .to_string(),
            };
            let target = targets
                .get(&key)
                .ok_or_else(|| RegistryError::UnsupportedPlatform(key.clone()))?;
            let install_dir = options.install_root.join(safe_dir(&agent.id));
            install_binary(agent, &registry_ref, target, &key, &install_dir).await
        }
    }
}

async fn install_binary(
    agent: &RegistryAgent,
    registry_ref: &RegistryRef,
    target: &BinaryTarget,
    platform_key: &str,
    install_dir: &Path,
) -> Result<InstallOutcome, RegistryError> {
    if !supported_archive(&target.archive) {
        return Err(RegistryError::UnsupportedDistribution(
            target
                .archive
                .rsplit('.')
                .next()
                .unwrap_or("archive")
                .to_string(),
        ));
    }
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

    if install_dir.exists() {
        std::fs::remove_dir_all(install_dir)
            .map_err(|error| RegistryError::Install(error.to_string()))?;
    }
    std::fs::create_dir_all(install_dir)
        .map_err(|error| RegistryError::Install(error.to_string()))?;
    extract(&bytes, &target.archive, install_dir)?;

    let program = install_dir.join(target.cmd.trim_start_matches("./"));
    if !program.exists() {
        let _ = std::fs::remove_dir_all(install_dir);
        return Err(RegistryError::Install(format!(
            "archive did not contain {}",
            target.cmd
        )));
    }
    make_executable(&program)?;

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
        registry_ref: registry_ref.clone(),
        warning,
        needs_node: false,
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

fn supported_archive(archive: &str) -> bool {
    archive.ends_with(".zip") || archive.ends_with(".tar.gz") || archive.ends_with(".tgz")
}

fn extract(bytes: &[u8], archive: &str, dest: &Path) -> Result<(), RegistryError> {
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
    Err(RegistryError::UnsupportedDistribution(
        archive.rsplit('.').next().unwrap_or("archive").to_string(),
    ))
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
