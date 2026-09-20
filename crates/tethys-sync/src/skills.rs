//! Skill library: canonical home, trust gate, and updates.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use tethys_schema::sync::{
    Scope, SkillInfo, SkillOrigin, SkillSource, SkillUpdateApplied, SkillUpdateCheck,
    SkillUpdatePlan,
};
use tethys_store::{EventStore, SkillRow};

use crate::diff::unified_diff;
use crate::error::SyncError;
use crate::skill_import::{self, Downloader};
use crate::trust;

/// Root and home pair for skill scopes.
pub struct SkillHome<'a> {
    pub root: &'a Path,
    pub home: &'a Path,
}

/// Canonical skills directory for a scope.
pub(crate) fn skills_dir(home: &SkillHome<'_>, scope: Scope) -> PathBuf {
    match scope {
        Scope::Global => home.home.join(".agents").join("skills"),
        Scope::Workspace => home.root.join(".agents").join("skills"),
    }
}

/// Canonical directory for one skill.
pub fn skill_dir(home: &SkillHome<'_>, scope: Scope, name: &str) -> PathBuf {
    skills_dir(home, scope).join(name)
}

/// Stable store id for one skill.
pub fn skill_id(scope: Scope, name: &str) -> String {
    format!("{}:{name}", scope.as_str())
}

/// Lists disk-discovered skills, workspace scope overriding global by name.
pub async fn list(store: &EventStore, home: SkillHome<'_>) -> Result<Vec<SkillInfo>, SyncError> {
    let mut by_name: BTreeMap<String, SkillInfo> = BTreeMap::new();
    for scope in [Scope::Workspace, Scope::Global] {
        for name in discover(&skills_dir(&home, scope))? {
            let info = load_or_record(store, &home, scope, &name).await?;
            by_name.entry(name).or_insert(info);
        }
    }
    Ok(by_name.into_values().collect())
}

/// Marks a skill trusted for its current content.
pub async fn trust(
    store: &EventStore,
    home: SkillHome<'_>,
    scope: Scope,
    name: &str,
) -> Result<SkillInfo, SyncError> {
    let info = load_required(store, &home, scope, name).await?;
    let trusted = SkillInfo {
        trusted: true,
        ..info
    };
    record(store, &trusted).await?;
    Ok(trusted)
}

/// Enables or disables a skill without deleting it.
pub async fn set_enabled(
    store: &EventStore,
    home: SkillHome<'_>,
    scope: Scope,
    name: &str,
    enabled: bool,
) -> Result<SkillInfo, SyncError> {
    let info = load_required(store, &home, scope, name).await?;
    let updated = SkillInfo { enabled, ..info };
    record(store, &updated).await?;
    Ok(updated)
}

/// Cheap upstream check: `git ls-remote` against the pinned SHA.
pub async fn update_check(
    store: &EventStore,
    home: SkillHome<'_>,
    scope: Scope,
    name: &str,
) -> Result<SkillUpdateCheck, SyncError> {
    let info = load_required(store, &home, scope, name).await?;
    let Some(remote) = remote_url(&info) else {
        return Ok(SkillUpdateCheck {
            name: info.name,
            pinned_sha: info.pinned_sha,
            upstream_sha: None,
            update_available: false,
            error: Some("skill has no upstream repository".into()),
        });
    };
    match skill_import::resolve_remote(&remote, info.source.reference.as_deref()) {
        Ok(sha) => Ok(SkillUpdateCheck {
            name: info.name,
            update_available: info.pinned_sha.as_deref() != Some(sha.as_str()),
            pinned_sha: info.pinned_sha,
            upstream_sha: Some(sha),
            error: None,
        }),
        Err(error) => Ok(SkillUpdateCheck {
            name: info.name,
            pinned_sha: info.pinned_sha,
            upstream_sha: None,
            update_available: false,
            error: Some(error.to_string()),
        }),
    }
}

/// Downloads upstream into staging and diffs it against the installed copy.
pub async fn update_plan(
    store: &EventStore,
    home: SkillHome<'_>,
    scope: Scope,
    name: &str,
    downloader: &dyn Downloader,
) -> Result<SkillUpdatePlan, SyncError> {
    let info = load_required(store, &home, scope, name).await?;
    let repo = info
        .source
        .repo
        .clone()
        .ok_or_else(|| SyncError::Registry("skill has no upstream repository".into()))?;
    let remote = remote_url(&info).unwrap_or_else(|| github_url(&repo));
    let sha = skill_import::resolve_remote(&remote, info.source.reference.as_deref())?;
    let bytes = downloader.get(&codeload_url(&repo, &sha))?;
    let staging = skill_import::stage_tarball(&home, scope, &bytes, info.source.subdir.as_deref())?;
    let upstream_root = skill_import::find_skill_root(&staging)?;
    let result = diff_dirs(Path::new(&info.path), &upstream_root);
    let _ = fs::remove_dir_all(&staging);
    let (changed_files, diff) = result?;
    Ok(SkillUpdatePlan {
        name: info.name,
        upstream_sha: sha,
        changed_files,
        diff,
    })
}

/// Applies an upstream update atomically and clears trust.
pub async fn update_apply(
    store: &EventStore,
    home: SkillHome<'_>,
    scope: Scope,
    name: &str,
    downloader: &dyn Downloader,
) -> Result<SkillUpdateApplied, SyncError> {
    let info = load_required(store, &home, scope, name).await?;
    let repo = info
        .source
        .repo
        .clone()
        .ok_or_else(|| SyncError::Registry("skill has no upstream repository".into()))?;
    let remote = remote_url(&info).unwrap_or_else(|| github_url(&repo));
    let sha = skill_import::resolve_remote(&remote, info.source.reference.as_deref())?;
    let bytes = downloader.get(&codeload_url(&repo, &sha))?;
    let staging = skill_import::stage_tarball(&home, scope, &bytes, info.source.subdir.as_deref())?;
    let upstream_root = skill_import::find_skill_root(&staging)?;
    let destination = PathBuf::from(&info.path);
    let swap = skill_import::swap_into_place(&destination, &upstream_root);
    let _ = fs::remove_dir_all(&staging);
    swap?;

    let facts = trust::inspect(&destination)?;
    let updated = SkillInfo {
        content_hash: facts.content_hash.clone(),
        requires_trust: facts.requires_trust,
        trusted: false,
        pinned_sha: Some(sha.clone()),
        ..info
    };
    record(store, &updated).await?;
    Ok(SkillUpdateApplied {
        name: updated.name,
        pinned_sha: sha,
        content_hash: facts.content_hash,
    })
}

fn github_url(repo: &str) -> String {
    format!("https://github.com/{repo}.git")
}

fn remote_url(info: &SkillInfo) -> Option<String> {
    info.source
        .url
        .clone()
        .or_else(|| info.source.repo.as_deref().map(github_url))
}

fn codeload_url(repo: &str, sha: &str) -> String {
    format!("https://codeload.github.com/{repo}/tar.gz/{sha}")
}

fn discover(dir: &Path) -> Result<Vec<String>, SyncError> {
    let Ok(read_dir) = fs::read_dir(dir) else {
        return Ok(Vec::new());
    };
    let mut names = Vec::new();
    for entry in read_dir {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        names.push(name);
    }
    names.sort();
    Ok(names)
}

async fn load_required(
    store: &EventStore,
    home: &SkillHome<'_>,
    scope: Scope,
    name: &str,
) -> Result<SkillInfo, SyncError> {
    let dir = skill_dir(home, scope, name);
    if !dir.is_dir() {
        return Err(SyncError::SkillNotFound {
            name: name.to_string(),
        });
    }
    load_or_record(store, home, scope, name).await
}

async fn load_or_record(
    store: &EventStore,
    home: &SkillHome<'_>,
    scope: Scope,
    name: &str,
) -> Result<SkillInfo, SyncError> {
    let dir = skill_dir(home, scope, name);
    let facts = trust::inspect(&dir)?;
    let id = skill_id(scope, name);
    let existing = match store.skill(&id).await? {
        Some(row) => info_from_row(&row, dir.clone())?,
        None => SkillInfo {
            name: name.to_string(),
            scope,
            path: dir.display().to_string(),
            source: SkillSource {
                origin: SkillOrigin::Folder,
                repo: None,
                reference: None,
                subdir: None,
                lock_hash: None,
                url: None,
            },
            enabled: true,
            requires_trust: facts.requires_trust,
            trusted: false,
            content_hash: facts.content_hash.clone(),
            pinned_sha: None,
        },
    };

    if existing.content_hash != facts.content_hash
        || existing.requires_trust != facts.requires_trust
    {
        let refreshed = SkillInfo {
            content_hash: facts.content_hash,
            requires_trust: facts.requires_trust,
            trusted: false,
            ..existing
        };
        record(store, &refreshed).await?;
        return Ok(refreshed);
    }
    Ok(existing)
}

/// Persists one skill row.
pub(crate) async fn record(store: &EventStore, info: &SkillInfo) -> Result<(), SyncError> {
    store
        .upsert_skill(SkillRow {
            skill_id: skill_id(info.scope, &info.name),
            scope: info.scope.as_str().to_string(),
            name: info.name.clone(),
            source: serde_json::to_string(&info.source)?,
            pinned_sha: info.pinned_sha.clone(),
            content_hash: info.content_hash.clone(),
            trusted_hash: info.trusted.then(|| info.content_hash.clone()),
            enabled: info.enabled,
            requires_trust: info.requires_trust,
        })
        .await?;
    Ok(())
}

fn info_from_row(row: &SkillRow, dir: PathBuf) -> Result<SkillInfo, SyncError> {
    let source: SkillSource = serde_json::from_str(&row.source)?;
    Ok(SkillInfo {
        name: row.name.clone(),
        scope: Scope::parse(&row.scope)
            .ok_or_else(|| SyncError::Registry(format!("unknown scope {}", row.scope)))?,
        path: dir.display().to_string(),
        source,
        enabled: row.enabled,
        requires_trust: row.requires_trust,
        trusted: row.trusted_hash.as_deref() == Some(row.content_hash.as_str()),
        content_hash: row.content_hash.clone(),
        pinned_sha: row.pinned_sha.clone(),
    })
}

fn diff_dirs(installed: &Path, upstream: &Path) -> Result<(Vec<String>, String), SyncError> {
    let before = read_dir_files(installed)?;
    let after = read_dir_files(upstream)?;
    let mut names: Vec<&String> = before.keys().chain(after.keys()).collect();
    names.sort();
    names.dedup();

    let mut changed = Vec::new();
    let mut diff = String::new();
    for name in names {
        let left = before.get(name);
        let right = after.get(name);
        if left == right {
            continue;
        }
        changed.push(name.clone());
        diff.push_str(&format!("--- a/{name}\n+++ b/{name}\n"));
        let left_text = left
            .map(|bytes| String::from_utf8_lossy(bytes).to_string())
            .unwrap_or_default();
        let right_text = right
            .map(|bytes| String::from_utf8_lossy(bytes).to_string())
            .unwrap_or_default();
        diff.push_str(&unified_diff(&left_text, &right_text));
    }
    Ok((changed, diff))
}

fn read_dir_files(root: &Path) -> Result<BTreeMap<String, Vec<u8>>, SyncError> {
    let mut files = BTreeMap::new();
    for (relative, absolute) in crate::walk::files(root, root)? {
        files.insert(relative.to_string_lossy().to_string(), fs::read(&absolute)?);
    }
    Ok(files)
}
