//! Atomic file writes and timestamped backups for vendor config files.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::SyncError;

/// Number of backups retained per config path.
pub const BACKUP_RETENTION: usize = 5;

/// Resolves a symlink to its target so writes go through the link.
pub fn resolve_link(path: &Path) -> PathBuf {
    match fs::read_link(path) {
        Ok(target) if target.is_absolute() => target,
        Ok(target) => path.parent().unwrap_or_else(|| Path::new(".")).join(target),
        Err(_) => path.to_path_buf(),
    }
}

/// Writes `contents` through a same-directory temp file, fsync, and rename.
///
/// Preserves the existing file mode and follows symlinks.
pub fn write_atomic(path: &Path, contents: &str) -> Result<(), SyncError> {
    let target = resolve_link(path);
    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)?;

    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    temp.write_all(contents.as_bytes())?;
    temp.as_file().sync_all()?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = fs::metadata(&target) {
            let mode = metadata.permissions().mode();
            let permissions = fs::Permissions::from_mode(mode);
            temp.as_file().set_permissions(permissions)?;
        }
    }

    temp.persist(&target)
        .map_err(|error| SyncError::Io(error.error))?;

    if let Ok(dir) = fs::File::open(parent) {
        let _ = dir.sync_all();
    }
    Ok(())
}

/// Directory holding backups for one path, under `~/.tethys/backups`.
pub fn backup_dir(home: &Path, path: &Path) -> PathBuf {
    home.join(".tethys").join("backups").join(encode_path(path))
}

/// URL-safe directory name for a config path (with a short path hash suffix).
pub fn encode_path(path: &Path) -> String {
    let encoded: String = path
        .to_string_lossy()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect();
    let hash = blake3::hash(path.to_string_lossy().as_bytes());
    format!("{encoded}-{}", &hash.to_hex()[..8])
}

/// Copies `path` into the backup directory, pruning to [`BACKUP_RETENTION`].
pub fn backup_file(home: &Path, path: &Path) -> Result<Option<PathBuf>, SyncError> {
    if !path.exists() {
        return Ok(None);
    }
    let dir = backup_dir(home, path);
    fs::create_dir_all(&dir)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let destination = dir.join(format!("{timestamp}.bak"));
    fs::copy(path, &destination)?;
    prune_backups(&dir)?;
    Ok(Some(destination))
}

/// Newest backup for `path`, when one exists.
pub fn newest_backup(home: &Path, path: &Path) -> Result<Option<PathBuf>, SyncError> {
    let dir = backup_dir(home, path);
    let Ok(read_dir) = fs::read_dir(&dir) else {
        return Ok(None);
    };
    let mut backups: Vec<PathBuf> = read_dir
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|entry| entry.extension().is_some_and(|ext| ext == "bak"))
        .collect();
    backups.sort();
    Ok(backups.pop())
}

fn prune_backups(dir: &Path) -> Result<(), SyncError> {
    let Ok(read_dir) = fs::read_dir(dir) else {
        return Ok(());
    };
    let mut backups: Vec<PathBuf> = read_dir
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|entry| entry.extension().is_some_and(|ext| ext == "bak"))
        .collect();
    backups.sort();
    while backups.len() > BACKUP_RETENTION {
        let oldest = backups.remove(0);
        let _ = fs::remove_file(oldest);
    }
    Ok(())
}
