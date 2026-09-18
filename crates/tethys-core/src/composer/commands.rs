//! `/` command discovery and expansion (CMP-01).
//!
//! Commands are plain markdown files with no frontmatter, one flat folder per
//! scope; the filename is the command name and project entries shadow global
//! ones. Expansion closes PD-3 via `{{args}}` and resolves nested `$`/`@`
//! references to plaintext.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use tethys_api::ApiError;
use tethys_schema::composer::{CommandInfo, CommandScope, ComposerReference, ExpandedCommand};

use crate::composer::paths::path_reference;
use crate::composer::skills::{skill_reference, SkillCandidate};

/// `~/.tethys/commands` (global scope).
pub fn global_commands_dir(home: &Path) -> PathBuf {
    home.join(".tethys").join("commands")
}

/// `<repo>/.tethys/commands` (project scope).
pub fn project_commands_dir(project_root: &Path) -> PathBuf {
    project_root.join(".tethys").join("commands")
}

/// Lists available commands, project entries shadowing global by name.
pub fn list_commands(
    global_dir: &Path,
    project_root: Option<&Path>,
) -> Result<Vec<CommandInfo>, ApiError> {
    let mut by_name: BTreeMap<String, CommandInfo> = BTreeMap::new();
    for command in discover(global_dir, CommandScope::Global) {
        by_name.insert(command.name.clone(), command);
    }
    if let Some(root) = project_root {
        for command in discover(&project_commands_dir(root), CommandScope::Project) {
            by_name.insert(command.name.clone(), command);
        }
    }
    Ok(by_name.into_values().collect())
}

/// Expands one command body with `args_text` and nested `$`/`@` references.
pub fn expand_command(
    global_dir: &Path,
    project_root: Option<&Path>,
    skills: &[SkillCandidate],
    command: &str,
    args_text: &str,
) -> Result<ExpandedCommand, ApiError> {
    let info = list_commands(global_dir, project_root)?
        .into_iter()
        .find(|info| info.name == command)
        .ok_or_else(|| ApiError::NotFound(format!("command not found: {command}")))?;

    let body = fs::read_to_string(&info.path)
        .map_err(|error| ApiError::Internal(format!("read command {}: {error}", info.path)))?;

    let with_args = apply_args(&body, args_text);
    let (text, references) = resolve_tokens(&with_args, project_root, skills);
    Ok(ExpandedCommand { text, references })
}

fn discover(dir: &Path, scope: CommandScope) -> Vec<CommandInfo> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
                return None;
            }
            let name = path.file_stem()?.to_str()?.to_string();
            Some(CommandInfo {
                name,
                scope,
                path: path.display().to_string(),
            })
        })
        .collect()
}

/// PD-3: `{{args}}` substitutes in place; otherwise args are appended.
fn apply_args(body: &str, args_text: &str) -> String {
    if body.contains("{{args}}") {
        body.replace("{{args}}", args_text)
    } else if args_text.trim().is_empty() {
        body.to_string()
    } else {
        format!("{body}\n{args_text}")
    }
}

enum Token<'a> {
    Text(&'a str),
    Skill(&'a str),
    Path(&'a str),
}

fn resolve_tokens(
    text: &str,
    project_root: Option<&Path>,
    skills: &[SkillCandidate],
) -> (String, Vec<ComposerReference>) {
    let mut resolved = String::with_capacity(text.len());
    let mut references = Vec::new();

    for token in scan_tokens(text) {
        match token {
            Token::Text(segment) => resolved.push_str(segment),
            Token::Skill(name) => match skills.iter().find(|skill| skill.name == name) {
                Some(candidate) => {
                    let (fragment, reference) = skill_reference(candidate);
                    resolved.push_str(&fragment);
                    references.push(reference);
                }
                None => {
                    resolved.push('$');
                    resolved.push_str(name);
                }
            },
            Token::Path(raw) => {
                let (token, suffix) = split_path_token(raw);
                let reference =
                    project_root.and_then(|root| path_reference(root, strip_range(token)));
                match reference {
                    Some((fragment, reference)) => {
                        resolved.push_str(&fragment);
                        resolved.push_str(suffix);
                        references.push(reference);
                    }
                    None => {
                        resolved.push('@');
                        resolved.push_str(raw);
                    }
                }
            }
        }
    }

    (resolved, references)
}

fn scan_tokens(text: &str) -> Vec<Token<'_>> {
    let bytes = text.as_bytes();
    let mut tokens = Vec::new();
    let mut index = 0;
    let mut segment_start = 0;

    while index < bytes.len() {
        let (name_start, is_skill) = match bytes[index] {
            b'$' => (index + 1, true),
            b'@' => (index + 1, false),
            _ => {
                index += 1;
                continue;
            }
        };

        let mut end = name_start;
        if is_skill {
            while end < bytes.len() && is_skill_char(bytes[end]) {
                end += 1;
            }
        } else {
            while end < bytes.len() && !bytes[end].is_ascii_whitespace() {
                end += 1;
            }
        }

        if end == name_start {
            index += 1;
            continue;
        }

        if segment_start < index {
            tokens.push(Token::Text(&text[segment_start..index]));
        }
        let name = &text[name_start..end];
        tokens.push(if is_skill {
            Token::Skill(name)
        } else {
            Token::Path(name)
        });
        index = end;
        segment_start = end;
    }

    if segment_start < text.len() {
        tokens.push(Token::Text(&text[segment_start..]));
    }
    tokens
}

fn is_skill_char(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_'
}

/// Splits trailing punctuation from a path token so it can be restored
/// verbatim after resolution (e.g. the sentence period in `@src/main.rs.`).
fn split_path_token(raw: &str) -> (&str, &str) {
    let end = raw.trim_end_matches([',', ';', ')', ']', '}', '.']).len();
    (&raw[..end], &raw[end..])
}

/// Strips a deferred `:range` suffix (CMP-06).
fn strip_range(token: &str) -> &str {
    match token.split_once(':') {
        Some((path, range)) if is_range(range) => path,
        _ => token,
    }
}

fn is_range(range: &str) -> bool {
    !range.is_empty() && range.chars().all(|c| c.is_ascii_digit() || c == '-')
}
