//! Canonical MCP registry (`~/.tethys/mcp.json` + `<workspace>/.tethys/mcp.json`).

use std::collections::{BTreeMap, BTreeSet};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tethys_schema::sync::{RegistryEntry, Scope, TargetId};

use crate::atomic;
use crate::error::SyncError;

/// Current canonical registry format version.
pub const REGISTRY_VERSION: u32 = 2;

/// One registry file on disk.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryFile {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub mcp_servers: BTreeMap<String, RegistryEntry>,
}

fn default_version() -> u32 {
    REGISTRY_VERSION
}

impl Default for RegistryFile {
    fn default() -> Self {
        Self {
            version: REGISTRY_VERSION,
            mcp_servers: BTreeMap::new(),
        }
    }
}

/// Global registry path for a home directory.
pub fn global_registry_path(home: &Path) -> PathBuf {
    home.join(".tethys").join("mcp.json")
}

/// Workspace registry path for a workspace root.
pub fn workspace_registry_path(root: &Path) -> PathBuf {
    root.join(".tethys").join("mcp.json")
}

/// Reads a registry file; `None` when the file does not exist.
pub fn read_registry(path: &Path) -> Result<Option<RegistryFile>, SyncError> {
    match std::fs::read_to_string(path) {
        Ok(text) if text.trim().is_empty() => Ok(Some(RegistryFile::default())),
        Ok(text) => serde_json::from_str(&text)
            .map(Some)
            .map_err(|error| SyncError::Parse {
                path: path.display().to_string(),
                message: error.to_string(),
            }),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// Writes a registry file atomically, optionally backing up the previous copy.
pub fn write_registry(
    path: &Path,
    file: &RegistryFile,
    backup_home: Option<&Path>,
) -> Result<(), SyncError> {
    if let Some(home) = backup_home {
        atomic::backup_file(home, path)?;
    }
    let mut to_write = file.clone();
    to_write.version = REGISTRY_VERSION;
    let mut text = serde_json::to_string_pretty(&to_write)?;
    text.push('\n');
    atomic::write_atomic(path, &text)
}

/// Global and workspace registries, merged on demand.
#[derive(Debug, Clone, Default)]
pub struct Registry {
    pub global: RegistryFile,
    pub workspace: RegistryFile,
}

impl Registry {
    /// Loads both scopes; a missing file is an empty registry.
    pub fn load(global: Option<&Path>, workspace: Option<&Path>) -> Result<Self, SyncError> {
        Ok(Self {
            global: load_or_default(global)?,
            workspace: load_or_default(workspace)?,
        })
    }

    /// Entries visible to `target`: global, overridden by workspace, minus
    /// disabled entries and entries that exclude the target.
    pub fn effective(
        &self,
        target: TargetId,
        disabled: &BTreeSet<String>,
    ) -> Vec<(String, RegistryEntry)> {
        let mut merged: BTreeMap<String, RegistryEntry> = self.global.mcp_servers.clone();
        merged.extend(self.workspace.mcp_servers.clone());
        merged
            .into_iter()
            .filter(|(name, entry)| {
                entry.meta.enabled && entry.meta.allows(target) && !disabled.contains(name)
            })
            .collect()
    }

    /// Entries visible to `provider_id`: global, overridden by workspace, minus
    /// disabled entries and entries that exclude the provider.
    pub fn effective_for_provider(
        &self,
        provider_id: Option<&str>,
        disabled: &BTreeSet<String>,
    ) -> Vec<(String, RegistryEntry)> {
        let mut merged: BTreeMap<String, RegistryEntry> = self.global.mcp_servers.clone();
        merged.extend(self.workspace.mcp_servers.clone());
        merged
            .into_iter()
            .filter(|(name, entry)| {
                let allowed = match provider_id {
                    Some(pid) => entry.meta.allows_provider(pid),
                    None => true,
                };
                entry.meta.enabled && allowed && !disabled.contains(name)
            })
            .collect()
    }


    /// Merged view with each entry's scope, for import conflict detection.
    pub fn merged(&self) -> BTreeMap<String, (Scope, RegistryEntry)> {
        let mut merged: BTreeMap<String, (Scope, RegistryEntry)> = self
            .global
            .mcp_servers
            .iter()
            .map(|(name, entry)| (name.clone(), (Scope::Global, entry.clone())))
            .collect();
        for (name, entry) in &self.workspace.mcp_servers {
            merged.insert(name.clone(), (Scope::Workspace, entry.clone()));
        }
        merged
    }
}

fn load_or_default(path: Option<&Path>) -> Result<RegistryFile, SyncError> {
    match path {
        Some(path) => Ok(read_registry(path)?.unwrap_or_default()),
        None => Ok(RegistryFile::default()),
    }
}
