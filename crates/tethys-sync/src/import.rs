//! Onboarding import: detect foreign tool configs, preview, apply.

use std::collections::BTreeMap;
use std::path::Path;

use serde_json::Value;
use tethys_schema::sync::EntryMeta;
use tethys_schema::sync::{ImportCandidate, ImportFailure, ImportScan, RegistryEntry, Scope};

use crate::error::SyncError;
use crate::projection::read_text;
use crate::projectors::{ClaudeCodeProjector, CodexProjector, OpenCodeProjector, Projector};
use crate::registry::{read_registry, write_registry, RegistryFile};

/// Inputs for a read-only scan across every detected tool.
pub struct ScanRequest<'a> {
    pub root: &'a Path,
    pub home: &'a Path,
}

/// Reads every detected tool config without modifying anything.
pub fn scan(request: ScanRequest<'_>) -> ImportScan {
    let mut candidates = Vec::new();
    let mut failures = Vec::new();

    scan_file(
        &ClaudeCodeProjector.detect(request.root, request.home),
        &ClaudeCodeProjector,
        &mut candidates,
        &mut failures,
    );
    scan_file(
        &CodexProjector.detect(request.root, request.home),
        &CodexProjector,
        &mut candidates,
        &mut failures,
    );
    scan_file(
        &OpenCodeProjector.detect(request.root, request.home),
        &OpenCodeProjector,
        &mut candidates,
        &mut failures,
    );

    scan_claude_user_config(request.home, request.root, &mut candidates, &mut failures);

    mark_conflicts(&mut candidates);
    ImportScan {
        candidates,
        failures,
    }
}

fn scan_file(
    targets: &[crate::projectors::TargetFile],
    projector: &dyn Projector,
    candidates: &mut Vec<ImportCandidate>,
    failures: &mut Vec<ImportFailure>,
) {
    for target in targets {
        let source = target.path.display().to_string();
        let text = match read_text(&target.path) {
            Ok(Some(text)) => text,
            Ok(None) => continue,
            Err(error) => {
                failures.push(ImportFailure {
                    source_path: source,
                    message: error.to_string(),
                });
                continue;
            }
        };
        match projector.read_entries(&text) {
            Ok(entries) => {
                candidates.extend(entries.into_iter().map(|(name, entry)| ImportCandidate {
                    name,
                    entry,
                    source_path: target.path.display().to_string(),
                    scope: target.scope,
                    conflict: false,
                }));
            }
            Err(error) => failures.push(ImportFailure {
                source_path: source,
                message: error.to_string(),
            }),
        }
    }
}

/// Reads `~/.claude.json` read-only: top-level servers plus this project's nested set.
fn scan_claude_user_config(
    home: &Path,
    root: &Path,
    candidates: &mut Vec<ImportCandidate>,
    failures: &mut Vec<ImportFailure>,
) {
    let path = home.join(".claude.json");
    let source = path.display().to_string();
    let text = match read_text(&path) {
        Ok(Some(text)) => text,
        Ok(None) => return,
        Err(error) => {
            failures.push(ImportFailure {
                source_path: source,
                message: error.to_string(),
            });
            return;
        }
    };
    let document: Value = match serde_json::from_str(&text) {
        Ok(document) => document,
        Err(error) => {
            failures.push(ImportFailure {
                source_path: source,
                message: error.to_string(),
            });
            return;
        }
    };

    if let Some(servers) = document.get("mcpServers").and_then(Value::as_object) {
        candidates.extend(entries_from_map(servers).into_iter().map(|(name, entry)| {
            ImportCandidate {
                name,
                entry,
                source_path: path.display().to_string(),
                scope: Scope::Global,
                conflict: false,
            }
        }));
    }

    let root_keys = [
        root.display().to_string(),
        root.canonicalize()
            .unwrap_or_else(|_| root.to_path_buf())
            .display()
            .to_string(),
    ];
    if let Some(projects) = document.get("projects").and_then(Value::as_object) {
        for key in root_keys {
            let Some(servers) = projects
                .get(&key)
                .and_then(|project| project.get("mcpServers"))
                .and_then(Value::as_object)
            else {
                continue;
            };
            candidates.extend(entries_from_map(servers).into_iter().map(|(name, entry)| {
                ImportCandidate {
                    name,
                    entry,
                    source_path: format!("{source}#projects[{key}]"),
                    scope: Scope::Workspace,
                    conflict: false,
                }
            }));
        }
    }
}

fn entries_from_map(map: &serde_json::Map<String, Value>) -> BTreeMap<String, RegistryEntry> {
    map.iter()
        .filter_map(|(name, value)| {
            crate::projectors::entry_from_value(value).map(|entry| (name.clone(), entry))
        })
        .collect()
}

/// Flags same-name candidates whose configs differ.
fn mark_conflicts(candidates: &mut [ImportCandidate]) {
    let mut digests: BTreeMap<String, std::collections::BTreeSet<String>> = BTreeMap::new();
    for candidate in candidates.iter() {
        let digest = serde_json::to_string(&candidate.entry).unwrap_or_default();
        digests
            .entry(candidate.name.clone())
            .or_default()
            .insert(digest);
    }
    for candidate in candidates.iter_mut() {
        candidate.conflict = digests
            .get(&candidate.name)
            .is_some_and(|set| set.len() > 1);
    }
}

/// Writes the chosen candidates into the registry, never auto-resolving.
pub fn apply_import(
    registry_path: &Path,
    selection: &[ImportCandidate],
    scope: Scope,
    backup_home: Option<&Path>,
) -> Result<Vec<String>, SyncError> {
    let mut file = read_registry(registry_path)?.unwrap_or_else(RegistryFile::default);
    let mut names = Vec::with_capacity(selection.len());
    for candidate in selection {
        let mut entry = candidate.entry.clone();
        entry.meta = EntryMeta {
            scope: Some(scope),
            targets: entry.meta.targets.clone(),
            enabled: true,
            legacy: entry.meta.legacy,
        };
        file.mcp_servers.insert(candidate.name.clone(), entry);
        names.push(candidate.name.clone());
    }
    write_registry(registry_path, &file, backup_home)?;
    Ok(names)
}
