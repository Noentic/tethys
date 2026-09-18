//! Plan, apply, verify, and rollback over one target file.

use std::collections::BTreeMap;
use std::io::ErrorKind;
use std::path::Path;

use tethys_schema::sync::{
    Applied, EntryProjection, EntryState, ProjectionPlan, RegistryEntry, Scope, TargetId,
    TransportKind, VerifyStatus,
};

use crate::atomic;
use crate::diff::unified_diff;
use crate::error::SyncError;
use crate::manifest::{entry_digest, file_digest};
use crate::projectors::Projector;

/// Inputs for building a projection plan.
pub struct PlanRequest<'a> {
    pub projector: &'a dyn Projector,
    pub path: &'a Path,
    pub scope: Scope,
    pub original: Option<&'a str>,
    pub desired: &'a [(String, RegistryEntry)],
    /// Entry hashes Tethys last wrote, from the manifest.
    pub owned: &'a BTreeMap<String, String>,
}

/// Builds a preview: per-entry states, proposed content, and a unified diff.
pub fn plan(request: PlanRequest<'_>) -> Result<ProjectionPlan, SyncError> {
    let original = request.original.unwrap_or("");
    let created = original.trim().is_empty();
    let base_hash = file_digest(original.as_bytes());
    let on_disk = if created {
        BTreeMap::new()
    } else {
        request.projector.read_entries(original)?
    };

    let mut content = original.to_string();
    let mut entries = Vec::with_capacity(request.desired.len());

    for (name, entry) in request.desired {
        if entry.transport == TransportKind::Sse {
            entries.push(EntryProjection {
                name: name.clone(),
                state: EntryState::Unsupported,
                projected: false,
                notes: vec!["sse transport is import-only".into()],
            });
            continue;
        }

        let mut state = EntryState::Pending;
        let mut notes = Vec::new();
        match (request.owned.get(name), on_disk.get(name)) {
            (Some(owned_hash), Some(current)) => {
                if entry_digest(current) != *owned_hash {
                    state = EntryState::Conflict;
                    notes.push("entry changed outside Tethys".into());
                } else if entry_digest(entry) == *owned_hash {
                    state = EntryState::InSync;
                }
            }
            (Some(_), None) => {}
            (None, Some(_)) => {
                state = EntryState::Conflict;
                notes.push("foreign entry with the same name".into());
            }
            (None, None) => {}
        }

        if request.projector.target() == TargetId::Codex
            && entry.transport == TransportKind::Stdio
            && entry.env.values().any(|value| value.secret_ref().is_some())
        {
            state = EntryState::Unsupported;
            notes.push("secret env values are omitted for codex stdio".into());
        }

        let projected = state != EntryState::Conflict;
        if projected && state != EntryState::InSync {
            content = request.projector.inject(&content, name, entry)?;
        }
        entries.push(EntryProjection {
            name: name.clone(),
            state,
            projected,
            notes,
        });
    }

    Ok(ProjectionPlan {
        target: request.projector.target(),
        path: request.path.display().to_string(),
        scope: request.scope,
        base_hash,
        created,
        diff: unified_diff(original, &content),
        content,
        entries,
    })
}

/// Inputs for applying a plan.
pub struct ApplyRequest<'a> {
    pub projector: &'a dyn Projector,
    pub plan: &'a ProjectionPlan,
    pub home: &'a Path,
}

/// Applies a plan after re-reading the file and refusing stale bytes.
pub fn apply(request: ApplyRequest<'_>) -> Result<Applied, SyncError> {
    let plan = request.plan;
    let path = Path::new(&plan.path);
    let current = read_text(path)?.unwrap_or_default();
    if file_digest(current.as_bytes()) != plan.base_hash {
        return Err(SyncError::StalePlan {
            path: plan.path.clone(),
        });
    }

    let conflicts: Vec<&str> = plan
        .entries
        .iter()
        .filter(|entry| entry.state == EntryState::Conflict)
        .map(|entry| entry.name.as_str())
        .collect();
    if !conflicts.is_empty() {
        return Err(SyncError::Conflict(format!(
            "entries changed outside Tethys: {}",
            conflicts.join(", ")
        )));
    }

    if path.exists() {
        atomic::backup_file(request.home, path)?;
    }
    atomic::write_atomic(path, &plan.content)?;

    let read_back = request.projector.read_entries(&plan.content)?;
    let entries = plan
        .entries
        .iter()
        .filter(|entry| entry.projected)
        .filter_map(|entry| {
            read_back
                .get(&entry.name)
                .map(|written| (entry.name.clone(), entry_digest(written)))
        })
        .collect();

    Ok(Applied {
        target: plan.target,
        path: plan.path.clone(),
        scope: plan.scope,
        file_hash: file_digest(plan.content.as_bytes()),
        created: plan.created,
        entries,
    })
}

/// Cheap verification: whole-file hash against the last apply.
pub fn verify(path: &Path, applied: &Applied) -> Result<VerifyStatus, SyncError> {
    match read_text(path)? {
        None => Ok(VerifyStatus::Missing),
        Some(text) => {
            if file_digest(text.as_bytes()) == applied.file_hash {
                Ok(VerifyStatus::InSync)
            } else {
                Ok(VerifyStatus::Drifted)
            }
        }
    }
}

/// Restores the newest backup (or deletes a file Tethys created).
pub fn rollback(applied: &Applied, home: &Path, force: bool) -> Result<(), SyncError> {
    let path = Path::new(&applied.path);
    let current = read_text(path)?.ok_or_else(|| SyncError::NotFound(applied.path.clone()))?;
    if file_digest(current.as_bytes()) != applied.file_hash && !force {
        return Err(SyncError::Conflict(
            "file changed after the projection was applied".into(),
        ));
    }

    if applied.created {
        std::fs::remove_file(path)?;
        return Ok(());
    }

    let backup = atomic::newest_backup(home, path)?
        .ok_or_else(|| SyncError::NotFound(format!("backup for {}", applied.path)))?;
    let contents = std::fs::read_to_string(backup)?;
    atomic::write_atomic(path, &contents)
}

/// Reads a file, treating absence as `None`.
pub fn read_text(path: &Path) -> Result<Option<String>, SyncError> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}
