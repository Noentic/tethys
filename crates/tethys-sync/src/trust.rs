//! Skill content digests and the script-detection trust gate.

use std::fs;
use std::path::Path;

use crate::error::SyncError;

const SCRIPT_EXTENSIONS: &[&str] = &[
    "sh", "bash", "zsh", "ps1", "bat", "cmd", "py", "js", "ts", "rb", "pl", "exe", "dll",
];

/// Content hash plus trust facts for one skill directory.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillFacts {
    pub content_hash: String,
    pub requires_trust: bool,
}

/// Walks a skill directory once, computing the digest and script facts.
pub fn inspect(dir: &Path) -> Result<SkillFacts, SyncError> {
    let files = crate::walk::files(dir, dir)?;

    let mut hasher = blake3::Hasher::new();
    let mut requires_trust = false;
    for (relative, absolute) in files {
        hasher.update(relative.to_string_lossy().as_bytes());
        hasher.update(&[0]);
        let bytes = fs::read(&absolute)?;
        hasher.update(&bytes);
        hasher.update(&[0]);
        requires_trust |= script_like(&relative, &absolute, &bytes);
    }

    Ok(SkillFacts {
        content_hash: hasher.finalize().to_hex().to_string(),
        requires_trust,
    })
}

fn script_like(relative: &Path, absolute: &Path, bytes: &[u8]) -> bool {
    if relative.starts_with("scripts") {
        return true;
    }
    if bytes.starts_with(b"#!") {
        return true;
    }
    if std::str::from_utf8(bytes).is_err() {
        return true;
    }
    if let Some(extension) = absolute.extension().and_then(|ext| ext.to_str()) {
        if SCRIPT_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str()) {
            return true;
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = fs::metadata(absolute) {
            if metadata.permissions().mode() & 0o111 != 0 {
                return true;
            }
        }
    }
    false
}
