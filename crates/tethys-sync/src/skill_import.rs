//! Skill sources: folder, `.skill` zip, GitHub tarballs, and lockfiles.

use std::collections::BTreeMap;
use std::fs;
use std::io::Cursor;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use tethys_schema::sync::{Scope, SkillInfo, SkillOrigin, SkillSource};
use tethys_store::EventStore;

use crate::error::SyncError;
use crate::skills::{self, SkillHome};
use crate::trust;

/// Maximum entries extracted from one archive.
pub const MAX_ARCHIVE_ENTRIES: usize = 5_000;
/// Maximum extracted size from one archive (100 MB).
pub const MAX_ARCHIVE_BYTES: u64 = 100 * 1024 * 1024;

/// Fetches bytes for a URL; tests inject a local implementation.
pub trait Downloader: Send + Sync {
    fn get(&self, url: &str) -> Result<Vec<u8>, SyncError>;
}

/// Production downloader over HTTPS.
#[cfg(feature = "github")]
pub struct HttpDownloader;

#[cfg(feature = "github")]
impl Downloader for HttpDownloader {
    fn get(&self, url: &str) -> Result<Vec<u8>, SyncError> {
        let url_string = url.to_string();
        std::thread::spawn(move || {
            let client = reqwest::blocking::Client::builder()
                .user_agent("tethys")
                .build()
                .map_err(|error| SyncError::Network(error.to_string()))?;
            let response = client
                .get(&url_string)
                .send()
                .map_err(|error| SyncError::Network(error.to_string()))?;
            if !response.status().is_success() {
                return Err(SyncError::Network(format!(
                    "{url_string}: {}",
                    response.status()
                )));
            }
            response
                .bytes()
                .map(|bytes| bytes.to_vec())
                .map_err(|error| SyncError::Network(error.to_string()))
        })
        .join()
        .map_err(|_| SyncError::Network("download thread panicked".into()))?
    }
}

/// Parsed `owner/repo[/subdir]@ref` GitHub spec.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitHubSpec {
    pub owner: String,
    pub repo: String,
    pub subdir: Option<String>,
    pub reference: Option<String>,
}

/// Parses a GitHub import spec.
///
/// Accepts both shorthand `owner/repo[/subdir][@ref]` and full URL
/// `https://github.com/<owner>/<repo>[/tree/<ref>[/<subdir>]]`.
/// Any non-GitHub URL returns `SyncError::UnsupportedSource`.
pub fn parse_github_spec(spec: &str) -> Result<GitHubSpec, SyncError> {
    let trimmed = spec.trim();
    if let Some(rest) = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
    {
        let (host, path) = match rest.split_once('/') {
            Some((h, p)) => (h, p),
            None => (rest, ""),
        };
        let host = host.split(':').next().unwrap_or(host);
        if host != "github.com" && host != "www.github.com" {
            return Err(SyncError::UnsupportedSource(spec.to_string()));
        }
        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        if segments.len() < 2 {
            return Err(SyncError::Registry(format!(
                "github spec must be owner/repo[/subdir]@ref, got {spec}"
            )));
        }
        let owner = segments[0];
        let mut repo = segments[1];
        if let Some(stripped) = repo.strip_suffix(".git") {
            repo = stripped;
        }
        if segments.len() == 2 {
            return Ok(GitHubSpec {
                owner: owner.to_string(),
                repo: repo.to_string(),
                subdir: None,
                reference: None,
            });
        }
        if segments[2] == "tree" {
            let reference = segments.get(3).map(|s| s.to_string());
            let subdir = if segments.len() > 4 {
                Some(segments[4..].join("/"))
            } else {
                None
            };
            return Ok(GitHubSpec {
                owner: owner.to_string(),
                repo: repo.to_string(),
                subdir,
                reference,
            });
        } else {
            let subdir = Some(segments[2..].join("/"));
            return Ok(GitHubSpec {
                owner: owner.to_string(),
                repo: repo.to_string(),
                subdir,
                reference: None,
            });
        }
    }

    if trimmed.contains("://") {
        return Err(SyncError::UnsupportedSource(spec.to_string()));
    }

    let (path_part, reference) = match trimmed.split_once('@') {
        Some((path, reference)) => (path, Some(reference.to_string())),
        None => (trimmed, None),
    };
    let mut parts = path_part.splitn(3, '/');
    let owner = parts.next().unwrap_or_default();
    let repo = parts.next().unwrap_or_default();
    if owner.is_empty() || repo.is_empty() {
        return Err(SyncError::Registry(format!(
            "github spec must be owner/repo[/subdir]@ref, got {spec}"
        )));
    }
    Ok(GitHubSpec {
        owner: owner.to_string(),
        repo: repo.to_string(),
        subdir: parts.next().map(str::to_string),
        reference,
    })
}

/// Resolves a ref to a commit SHA using the local `git` binary.
pub fn resolve_remote(url: &str, reference: Option<&str>) -> Result<String, SyncError> {
    resolve_remote_with("git", url, reference)
}

/// Resolves a ref using an explicit git binary (tests inject a missing one).
pub fn resolve_remote_with(
    git_binary: &str,
    url: &str,
    reference: Option<&str>,
) -> Result<String, SyncError> {
    let pattern = reference.unwrap_or("HEAD");
    let output = std::process::Command::new(git_binary)
        .args(["ls-remote", url, pattern])
        .output()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                SyncError::GitMissing
            } else {
                SyncError::Git(error.to_string())
            }
        })?;
    if !output.status.success() {
        return Err(SyncError::Git(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find_map(|line| line.split_whitespace().next().map(str::to_string))
        .ok_or_else(|| SyncError::Git(format!("no ref {pattern} at {url}")))
}

/// codeload tarball URL for a resolved commit.
pub fn codeload_url(owner: &str, repo: &str, sha: &str) -> String {
    format!("https://codeload.github.com/{owner}/{repo}/tar.gz/{sha}")
}

/// Copies a folder into the canonical home.
pub async fn import_folder(
    store: &EventStore,
    home: SkillHome<'_>,
    scope: Scope,
    name: Option<&str>,
    source_dir: &Path,
) -> Result<SkillInfo, SyncError> {
    let staging = stage_dir(&home, scope, name.unwrap_or("skill"))?;
    copy_dir(source_dir, &staging)?;
    let source = SkillSource {
        origin: SkillOrigin::Folder,
        repo: None,
        reference: None,
        subdir: None,
        lock_hash: None,
        url: Some(source_dir.display().to_string()),
    };
    install(store, &home, scope, &staging, name, source, None).await
}

/// Extracts a `.skill` zip into the canonical home.
pub async fn import_zip(
    store: &EventStore,
    home: SkillHome<'_>,
    scope: Scope,
    bytes: &[u8],
) -> Result<SkillInfo, SyncError> {
    let staging = stage_dir(&home, scope, "skill")?;
    let result = extract_zip(bytes, &staging);
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    let source = SkillSource {
        origin: SkillOrigin::Archive,
        repo: None,
        reference: None,
        subdir: None,
        lock_hash: None,
        url: None,
    };
    install(store, &home, scope, &staging, None, source, None).await
}

/// Extracts a GitHub tarball for a subdir and installs it.
pub async fn import_tarball(
    store: &EventStore,
    home: SkillHome<'_>,
    scope: Scope,
    bytes: &[u8],
    subdir: Option<&str>,
    source: SkillSource,
    pinned_sha: Option<String>,
) -> Result<SkillInfo, SyncError> {
    let staging = stage_tarball(&home, scope, bytes, subdir)?;
    install(store, &home, scope, &staging, None, source, pinned_sha).await
}

/// Resolves and imports `owner/repo[/subdir]@ref`.
#[cfg(feature = "github")]
pub async fn import_github(
    store: &EventStore,
    home: SkillHome<'_>,
    scope: Scope,
    spec: &str,
) -> Result<SkillInfo, SyncError> {
    let spec = parse_github_spec(spec)?;
    let url = format!("https://github.com/{}/{}.git", spec.owner, spec.repo);
    let sha = resolve_remote(&url, spec.reference.as_deref())?;
    let bytes = HttpDownloader.get(&codeload_url(&spec.owner, &spec.repo, &sha))?;
    let source = SkillSource {
        origin: SkillOrigin::GitHub,
        repo: Some(format!("{}/{}", spec.owner, spec.repo)),
        reference: spec.reference.clone(),
        subdir: spec.subdir.clone(),
        lock_hash: None,
        url: None,
    };
    import_tarball(
        store,
        home,
        scope,
        &bytes,
        spec.subdir.as_deref(),
        source,
        Some(sha),
    )
    .await
}

/// Extracts a tarball into a staging directory next to the destination.
pub(crate) fn stage_tarball(
    home: &SkillHome<'_>,
    scope: Scope,
    bytes: &[u8],
    subdir: Option<&str>,
) -> Result<PathBuf, SyncError> {
    let staging = stage_dir(home, scope, "upstream")?;
    let result = extract_tar(bytes, &staging).and_then(|()| {
        if let Some(subdir) = subdir {
            strip_wrapper(&staging, subdir)
        } else {
            strip_single_wrapper(&staging)
        }
    });
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    Ok(staging)
}

/// Locates the directory containing `SKILL.md`.
pub(crate) fn find_skill_root(staging: &Path) -> Result<PathBuf, SyncError> {
    if staging.join("SKILL.md").is_file() {
        return Ok(staging.to_path_buf());
    }
    let mut candidates = Vec::new();
    collect_skill_dirs(staging, 0, &mut candidates)?;
    candidates.sort();
    candidates
        .into_iter()
        .next()
        .ok_or_else(|| SyncError::Registry("archive does not contain a SKILL.md".into()))
}

/// Swaps a validated directory into place with a single atomic rename.
pub(crate) fn swap_into_place(destination: &Path, source: &Path) -> Result<(), SyncError> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    if destination.exists() {
        let trash = destination.with_file_name(format!(
            ".trash-{}-{}",
            destination
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| "skill".into()),
            now_ms()
        ));
        fs::rename(destination, &trash)?;
        if let Err(error) = fs::rename(source, destination) {
            let _ = fs::rename(&trash, destination);
            return Err(error.into());
        }
        let _ = fs::remove_dir_all(trash);
    } else {
        fs::rename(source, destination)?;
    }
    Ok(())
}

/// One entry discovered in a `skills` CLI lockfile.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LockCandidate {
    pub name: String,
    pub source: SkillSource,
    pub installed: bool,
    pub supported: bool,
}

/// Scans project and global `skills` CLI lockfiles, read-only.
pub fn scan_lockfiles(root: &Path, home: &Path) -> Result<Vec<LockCandidate>, SyncError> {
    let mut candidates = Vec::new();

    if let Ok(Some(text)) = crate::projection::read_text(&root.join("skills-lock.json")) {
        let lock: LockV1 = serde_json::from_str(&text).map_err(|error| SyncError::Parse {
            path: root.join("skills-lock.json").display().to_string(),
            message: error.to_string(),
        })?;
        for (name, entry) in lock.skills {
            let supported = entry.source_type == "github";
            candidates.push(LockCandidate {
                installed: is_installed(root, home, &name),
                name,
                source: SkillSource {
                    origin: SkillOrigin::Lockfile,
                    repo: Some(entry.source),
                    reference: None,
                    subdir: Path::new(&entry.skill_path)
                        .parent()
                        .map(|parent| parent.to_string_lossy().to_string()),
                    lock_hash: entry.computed_hash,
                    url: None,
                },
                supported,
            });
        }
    }

    let global_path = match std::env::var_os("XDG_STATE_HOME") {
        Some(state) => PathBuf::from(state).join("skills").join(".skill-lock.json"),
        None => home.join(".agents").join(".skill-lock.json"),
    };
    if let Ok(Some(text)) = crate::projection::read_text(&global_path) {
        let lock: LockV3 = serde_json::from_str(&text).map_err(|error| SyncError::Parse {
            path: global_path.display().to_string(),
            message: error.to_string(),
        })?;
        for (name, entry) in lock.skills {
            let repo = entry
                .source_url
                .strip_prefix("https://github.com/")
                .map(|repo| repo.trim_end_matches(".git").to_string());
            let supported = repo.is_some();
            candidates.push(LockCandidate {
                installed: is_installed(root, home, &name),
                name,
                source: SkillSource {
                    origin: SkillOrigin::Lockfile,
                    repo,
                    reference: entry.reference,
                    subdir: None,
                    lock_hash: entry.skill_folder_hash,
                    url: Some(entry.source_url),
                },
                supported,
            });
        }
    }

    Ok(candidates)
}

fn is_installed(root: &Path, home: &Path, name: &str) -> bool {
    root.join(".agents").join("skills").join(name).is_dir()
        || home.join(".agents").join("skills").join(name).is_dir()
}

#[derive(Deserialize)]
struct LockV1 {
    #[allow(dead_code)]
    version: u32,
    skills: BTreeMap<String, LockV1Skill>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LockV1Skill {
    source: String,
    source_type: String,
    skill_path: String,
    computed_hash: Option<String>,
}

#[derive(Deserialize)]
struct LockV3 {
    #[allow(dead_code)]
    version: u32,
    skills: BTreeMap<String, LockV3Skill>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LockV3Skill {
    source_url: String,
    #[serde(rename = "ref", default)]
    reference: Option<String>,
    #[serde(default)]
    skill_folder_hash: Option<String>,
}

async fn install(
    store: &EventStore,
    home: &SkillHome<'_>,
    scope: Scope,
    staging: &Path,
    explicit_name: Option<&str>,
    source: SkillSource,
    pinned_sha: Option<String>,
) -> Result<SkillInfo, SyncError> {
    let root = find_skill_root(staging)?;
    let name = explicit_name
        .map(str::to_string)
        .or_else(|| frontmatter_name(&root))
        .or_else(|| {
            root.file_name()
                .map(|name| name.to_string_lossy().to_string())
        })
        .ok_or_else(|| SyncError::Registry("cannot determine skill name".into()))?;
    validate_name(&name)?;

    let destination = skills::skill_dir(home, scope, &name);
    let swap = swap_into_place(&destination, &root);
    let _ = fs::remove_dir_all(staging);
    swap?;

    let facts = trust::inspect(&destination)?;
    let info = SkillInfo {
        name,
        scope,
        path: destination.display().to_string(),
        source,
        enabled: true,
        requires_trust: facts.requires_trust,
        trusted: false,
        content_hash: facts.content_hash,
        pinned_sha,
    };
    skills::record(store, &info).await?;
    Ok(info)
}

fn frontmatter_name(dir: &Path) -> Option<String> {
    let text = fs::read_to_string(dir.join("SKILL.md")).ok()?;
    let mut lines = text.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    for line in lines {
        let line = line.trim();
        if line == "---" {
            break;
        }
        if let Some(value) = line.strip_prefix("name:") {
            let value = value.trim().trim_matches('"').trim_matches('\'');
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn validate_name(name: &str) -> Result<(), SyncError> {
    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err(SyncError::Registry(format!("invalid skill name {name}")));
    }
    Ok(())
}

fn stage_dir(home: &SkillHome<'_>, scope: Scope, hint: &str) -> Result<PathBuf, SyncError> {
    let parent = skills::skills_dir(home, scope);
    fs::create_dir_all(&parent)?;
    let staging = parent.join(format!(".staging-{hint}-{}", now_ms()));
    fs::create_dir_all(&staging)?;
    Ok(staging)
}

fn copy_dir(source: &Path, destination: &Path) -> Result<(), SyncError> {
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let path = entry.path();
        let target = destination.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            fs::create_dir_all(&target)?;
            copy_dir(&path, &target)?;
        } else if entry.file_type()?.is_file() {
            fs::copy(&path, &target)?;
        }
    }
    Ok(())
}

fn collect_skill_dirs(
    dir: &Path,
    depth: usize,
    candidates: &mut Vec<PathBuf>,
) -> Result<(), SyncError> {
    if depth > 4 {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let path = entry.path();
        if path.join("SKILL.md").is_file() {
            candidates.push(path);
        } else {
            collect_skill_dirs(&path, depth + 1, candidates)?;
        }
    }
    Ok(())
}

fn strip_wrapper(staging: &Path, subdir: &str) -> Result<(), SyncError> {
    let mut entries: Vec<PathBuf> = fs::read_dir(staging)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    entries.sort();
    let wrapper = entries
        .first()
        .ok_or_else(|| SyncError::Registry("archive has no wrapper directory".into()))?;
    let source = wrapper.join(subdir);
    if !source.is_dir() {
        return Err(SyncError::NotFound(format!("{subdir} in archive")));
    }
    move_contents(&source, staging)
}

fn strip_single_wrapper(staging: &Path) -> Result<(), SyncError> {
    let mut entries: Vec<PathBuf> = fs::read_dir(staging)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect();
    entries.sort();
    if entries.len() == 1 && entries[0].is_dir() {
        let wrapper = entries.remove(0);
        move_contents(&wrapper, staging)?;
    }
    Ok(())
}

fn move_contents(source: &Path, destination: &Path) -> Result<(), SyncError> {
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let target = destination.join(entry.file_name());
        fs::rename(entry.path(), &target)?;
    }
    Ok(())
}

fn extract_zip(bytes: &[u8], destination: &Path) -> Result<(), SyncError> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| SyncError::UnsafeArchive(error.to_string()))?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(SyncError::UnsafeArchive(format!(
            "{} entries exceeds the {MAX_ARCHIVE_ENTRIES} cap",
            archive.len()
        )));
    }
    let mut total: u64 = 0;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| SyncError::UnsafeArchive(error.to_string()))?;
        let Some(relative) = entry.enclosed_name() else {
            return Err(SyncError::UnsafeArchive(format!(
                "unsafe path {}",
                entry.name()
            )));
        };
        if entry.is_dir() {
            fs::create_dir_all(destination.join(&relative))?;
            continue;
        }
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(SyncError::UnsafeArchive(format!(
                "symlink {}",
                relative.display()
            )));
        }
        total += entry.size();
        if total > MAX_ARCHIVE_BYTES {
            return Err(SyncError::UnsafeArchive(format!(
                "extracted size exceeds {MAX_ARCHIVE_BYTES} bytes"
            )));
        }
        let target = destination.join(&relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut file = fs::File::create(&target)?;
        std::io::copy(&mut entry, &mut file)?;
    }
    Ok(())
}

fn extract_tar(bytes: &[u8], destination: &Path) -> Result<(), SyncError> {
    let decoder = flate2::read::GzDecoder::new(Cursor::new(bytes));
    let mut archive = tar::Archive::new(decoder);
    let mut count = 0usize;
    let mut total: u64 = 0;
    for entry in archive
        .entries()
        .map_err(|error| SyncError::UnsafeArchive(error.to_string()))?
    {
        let mut entry = entry.map_err(|error| SyncError::UnsafeArchive(error.to_string()))?;
        let entry_type = entry.header().entry_type();
        if !(entry_type.is_file() || entry_type.is_dir()) {
            return Err(SyncError::UnsafeArchive("archive contains a link".into()));
        }
        let path = entry
            .path()
            .map_err(|error| SyncError::UnsafeArchive(error.to_string()))?
            .into_owned();
        if path.has_root()
            || path
                .components()
                .any(|component| matches!(component, Component::ParentDir | Component::Prefix(..)))
        {
            return Err(SyncError::UnsafeArchive(format!(
                "unsafe path {}",
                path.display()
            )));
        }
        count += 1;
        total += entry
            .header()
            .size()
            .map_err(|error| SyncError::UnsafeArchive(error.to_string()))?;
        if count > MAX_ARCHIVE_ENTRIES || total > MAX_ARCHIVE_BYTES {
            return Err(SyncError::UnsafeArchive(
                "archive exceeds entry or size cap".into(),
            ));
        }
        entry
            .unpack_in(destination)
            .map_err(|error| SyncError::UnsafeArchive(error.to_string()))?;
    }
    Ok(())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
