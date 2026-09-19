//! `$skill` reference resolution (CMP-03, reference-only).
//!
//! A skill is referenced by name and `SKILL.md` path, never inlined. Only the
//! frontmatter `description` is read; the body is never loaded into the prompt.

use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use tethys_schema::composer::{ComposerReference, ReferenceKind};

/// A skill the composer can reference by name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillCandidate {
    pub name: String,
    /// Skill directory; `SKILL.md` lives inside it.
    pub path: PathBuf,
}

/// Builds the plaintext instruction for one skill plus its UI reference.
pub fn skill_reference(candidate: &SkillCandidate) -> (String, ComposerReference) {
    let skill_file = candidate.path.join("SKILL.md");
    let instruction = match read_description(&skill_file) {
        Some(description) => format!(
            "Use the skill \"{}\": {description}. Its instructions are at {}; read and follow it for this turn.",
            candidate.name,
            skill_file.display()
        ),
        None => format!(
            "Use the skill \"{}\". Its instructions are at {}; read and follow it for this turn.",
            candidate.name,
            skill_file.display()
        ),
    };

    let reference = ComposerReference {
        kind: ReferenceKind::Skill,
        name: candidate.name.clone(),
        path: candidate.path.display().to_string(),
        is_dir: false,
        mime: None,
        size: None,
    };

    (instruction, reference)
}

/// Reads only the leading frontmatter block, bounded to its first 64 lines.
fn read_description(skill_file: &Path) -> Option<String> {
    let reader = BufReader::new(File::open(skill_file).ok()?);
    let mut lines = reader.lines();
    if lines.next()?.ok()?.trim() != "---" {
        return None;
    }
    for line in lines.take(64) {
        let line = line.ok()?;
        let line = line.trim();
        if line == "---" {
            break;
        }
        if let Some(value) = line.strip_prefix("description:") {
            let value = value.trim().trim_matches('"').trim_matches('\'');
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}
