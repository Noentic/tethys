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
use tethys_schema::composer::{
    CommandInfo, CommandScope, CommandSource, ComposerReference, ExpandedCommand,
};
use tethys_sync::atomic::write_atomic;

use crate::composer::paths::path_reference;
use crate::composer::skills::{skill_reference, SkillCandidate};

/// Longest stored command description before truncation.
const DESCRIPTION_MAX: usize = 120;

/// `~/.tethys/commands` (global scope).
pub fn global_commands_dir(home: &Path) -> PathBuf {
    home.join(".tethys").join("commands")
}

/// `<workspace>/.tethys/commands` (workspace scope).
pub fn workspace_commands_dir(workspace_root: &Path) -> PathBuf {
    workspace_root.join(".tethys").join("commands")
}

pub fn project_commands_dir(workspace_root: &Path) -> PathBuf {
    workspace_commands_dir(workspace_root)
}

/// Lists available commands, workspace entries shadowing global by name.
pub fn list_commands(
    global_dir: &Path,
    workspace_root: Option<&Path>,
) -> Result<Vec<CommandInfo>, ApiError> {
    let mut by_name: BTreeMap<String, CommandInfo> = BTreeMap::new();
    for command in discover(global_dir, CommandScope::Global) {
        by_name.insert(command.name.clone(), command);
    }
    if let Some(root) = workspace_root {
        for command in discover(&workspace_commands_dir(root), CommandScope::Workspace) {
            by_name.insert(command.name.clone(), command);
        }
    }
    Ok(by_name.into_values().collect())
}

/// Lists commands from both scopes without shadowing, marking the losing
/// global entry with `shadowed = true` (CMP-07 Settings editor).
pub fn list_commands_with_shadowed(
    global_dir: &Path,
    workspace_root: Option<&Path>,
) -> Result<Vec<CommandInfo>, ApiError> {
    let mut commands = discover(global_dir, CommandScope::Global);
    let mut workspace = match workspace_root {
        Some(root) => discover(&workspace_commands_dir(root), CommandScope::Workspace),
        None => Vec::new(),
    };
    let workspace_names: Vec<&str> = workspace.iter().map(|c| c.name.as_str()).collect();
    for command in &mut commands {
        if workspace_names.contains(&command.name.as_str()) {
            command.shadowed = true;
        }
    }
    commands.append(&mut workspace);
    commands.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(commands)
}

/// Reads one command body from `dir` (CMP-07).
pub fn read_command(
    dir: &Path,
    name: &str,
    scope: CommandScope,
) -> Result<CommandSource, ApiError> {
    let path = command_file(dir, name)?;
    let body = fs::read_to_string(&path)
        .map_err(|_| ApiError::NotFound(format!("command not found: {name}")))?;
    Ok(CommandSource {
        name: name.to_string(),
        scope,
        path: path.display().to_string(),
        body,
    })
}

/// Creates or updates one command file (CMP-07), returning its info.
pub fn write_command(
    dir: &Path,
    name: &str,
    body: &str,
    scope: CommandScope,
) -> Result<CommandInfo, ApiError> {
    if !is_valid_command_name(name) {
        return Err(ApiError::InvalidConfig(format!(
            "invalid command name {name:?}: use lowercase letters, digits, '-' and '_'"
        )));
    }
    let path = command_file(dir, name)?;
    write_atomic(&path, body)
        .map_err(|error| ApiError::Internal(format!("write command {}: {error}", path.display())))?;
    Ok(CommandInfo {
        name: name.to_string(),
        scope,
        path: path.display().to_string(),
        description: read_description(&path),
        shadowed: false,
    })
}

/// Deletes one command file; a missing file is `NotFound` (CMP-07).
pub fn delete_command(dir: &Path, name: &str, _scope: CommandScope) -> Result<(), ApiError> {
    let path = command_file(dir, name)?;
    fs::remove_file(&path)
        .map_err(|_| ApiError::NotFound(format!("command not found: {name}")))
}

/// Authoring rule for new names (CMP-07): lowercase letters, digits, `-`, `_`.
pub fn is_valid_command_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

/// Resolves a command path, rejecting separators and traversal.
fn command_file(dir: &Path, name: &str) -> Result<PathBuf, ApiError> {
    let safe = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !safe {
        return Err(ApiError::InvalidConfig(format!(
            "invalid command name: {name:?}"
        )));
    }
    Ok(dir.join(format!("{name}.md")))
}

/// Expands one command body with `args_text` and nested `$`/`@` references.
pub fn expand_command(
    global_dir: &Path,
    workspace_root: Option<&Path>,
    skills: &[SkillCandidate],
    command: &str,
    args_text: &str,
) -> Result<ExpandedCommand, ApiError> {
    let info = list_commands(global_dir, workspace_root)?
        .into_iter()
        .find(|info| info.name == command)
        .ok_or_else(|| ApiError::NotFound(format!("command not found: {command}")))?;

    let body = fs::read_to_string(&info.path)
        .map_err(|error| ApiError::Internal(format!("read command {}: {error}", info.path)))?;

    let with_args = apply_args(&body, args_text);
    let (text, references) = resolve_tokens(&with_args, workspace_root, skills);
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
                description: read_description(&path),
                name,
                scope,
                path: path.display().to_string(),
                shadowed: false,
            })
        })
        .collect()
}

/// First non-empty body line, truncated on a char boundary.
fn read_description(path: &Path) -> Option<String> {
    let body = fs::read_to_string(path).ok()?;
    let line = body.lines().map(str::trim).find(|line| !line.is_empty())?;
    if line.chars().count() <= DESCRIPTION_MAX {
        return Some(line.to_string());
    }
    let mut truncated: String = line.chars().take(DESCRIPTION_MAX).collect();
    truncated.push('…');
    Some(truncated)
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
    workspace_root: Option<&Path>,
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
                    workspace_root.and_then(|root| path_reference(root, strip_range(token)));
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
