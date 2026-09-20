//! Composer golden tests: command discovery/expansion, skill and path references.

use std::fs;
use std::path::Path;

use tethys_api::ApiError;
use tethys_core::composer::{
    expand_command, list_commands, path_reference, skill_reference, SkillCandidate,
};
use tethys_schema::composer::{CommandScope, ReferenceKind};

fn write(path: &Path, contents: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent");
    }
    fs::write(path, contents).expect("write file");
}

fn global_dir(root: &Path) -> std::path::PathBuf {
    root.join("global")
}

fn workspace_dir(root: &Path) -> std::path::PathBuf {
    root.join("workspace")
}

fn workspace_command(root: &Path, name: &str) -> std::path::PathBuf {
    workspace_dir(root)
        .join(".tethys/commands")
        .join(format!("{name}.md"))
}

fn skill(root: &Path, name: &str, skill_md: &str) -> SkillCandidate {
    let path = root.join("skills").join(name);
    write(&path.join("SKILL.md"), skill_md);
    SkillCandidate {
        name: name.to_string(),
        path,
    }
}

#[test]
fn workspace_commands_shadow_global() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let global = global_dir(tmp.path());
    write(&global.join("review.md"), "Review global.");
    write(&global.join("global-only.md"), "Global only.");
    write(&workspace_command(tmp.path(), "review"), "Review project.");
    write(&workspace_command(tmp.path(), "deploy"), "Deploy.");

    let commands = list_commands(&global, Some(&workspace_dir(tmp.path()))).expect("list");
    let names: Vec<&str> = commands.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(names, vec!["deploy", "global-only", "review"]);

    let review = commands
        .iter()
        .find(|c| c.name == "review")
        .expect("review");
    assert_eq!(review.scope, CommandScope::Workspace);

    let global_only = commands
        .iter()
        .find(|c| c.name == "global-only")
        .expect("global");
    assert_eq!(global_only.scope, CommandScope::Global);
}

#[test]
fn list_without_workspace_returns_globals() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let global = global_dir(tmp.path());
    write(&global.join("review.md"), "Review.");

    let commands = list_commands(&global, None).expect("list");
    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0].scope, CommandScope::Global);
}

#[test]
fn args_are_appended_without_placeholder() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let global = global_dir(tmp.path());
    write(&global.join("review.md"), "Review the diff.");

    let expanded = expand_command(&global, None, &[], "review", "focus on errors").expect("expand");
    assert_eq!(expanded.text, "Review the diff.\nfocus on errors");
    assert!(expanded.references.is_empty());
}

#[test]
fn placeholder_substitutes_every_occurrence() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let global = global_dir(tmp.path());
    write(&global.join("greet.md"), "Hello {{args}}. Again: {{args}}.");

    let expanded = expand_command(&global, None, &[], "greet", "world").expect("expand");
    assert_eq!(expanded.text, "Hello world. Again: world.");
}

#[test]
fn missing_command_is_not_found() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let global = global_dir(tmp.path());

    match expand_command(&global, None, &[], "absent", "") {
        Err(ApiError::NotFound(message)) => assert!(message.contains("absent")),
        other => panic!("expected NotFound, got {other:?}"),
    }
}

#[test]
fn nested_skill_and_path_resolve_to_plaintext() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let global = global_dir(tmp.path());
    let workspace = workspace_dir(tmp.path());
    write(&workspace.join("src/auth.rs"), "SECRET_FILE_BYTES");
    write(
        &global.join("check.md"),
        "Check $rust against @src/auth.rs:40-80.",
    );
    let rust = skill(
        tmp.path(),
        "rust",
        "---\nname: rust\ndescription: Idiomatic Rust guidance\n---\n\nSENTINEL_SKILL_BODY\n",
    );

    let expanded = expand_command(&global, Some(&workspace), &[rust], "check", "").expect("expand");

    assert!(expanded.text.contains("Use the skill \"rust\""));
    assert!(expanded.text.contains("Idiomatic Rust guidance"));
    assert!(expanded.text.contains("@src/auth.rs"));
    assert!(
        !expanded.text.contains(":40-80"),
        "range not stripped: {}",
        expanded.text
    );
    assert!(!expanded.text.contains("SECRET_FILE_BYTES"));
    assert!(!expanded.text.contains("SENTINEL_SKILL_BODY"));

    assert_eq!(expanded.references.len(), 2);
    assert_eq!(expanded.references[0].kind, ReferenceKind::Skill);
    assert_eq!(expanded.references[0].name, "rust");
    assert_eq!(expanded.references[1].kind, ReferenceKind::Path);
    assert_eq!(expanded.references[1].path, "src/auth.rs");
    assert!(!expanded.references[1].is_dir);
    assert_eq!(
        expanded.references[1].size,
        Some("SECRET_FILE_BYTES".len() as f64)
    );
}

#[test]
fn unknown_skill_token_stays_literal() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let global = global_dir(tmp.path());
    write(&global.join("run.md"), "Run $missing now.");

    let expanded = expand_command(&global, None, &[], "run", "").expect("expand");
    assert!(expanded.text.contains("$missing"));
    assert!(expanded.references.is_empty());
}

#[test]
fn path_token_preserves_trailing_punctuation() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let global = global_dir(tmp.path());
    let workspace = workspace_dir(tmp.path());
    write(&workspace.join("src/main.rs"), "fn main() {}\n");
    write(&global.join("note.md"), "See (@src/main.rs).");

    let expanded = expand_command(&global, Some(&workspace), &[], "note", "").expect("expand");
    assert!(
        expanded.text.contains("(@src/main.rs)."),
        "trailing punctuation lost: {}",
        expanded.text
    );
    assert_eq!(expanded.references[0].path, "src/main.rs");
}

#[test]
fn path_reference_reports_directories_and_blocks_escape() {
    let tmp = tempfile::tempdir().expect("temp dir");
    let workspace = workspace_dir(tmp.path());
    fs::create_dir_all(workspace.join("src")).expect("src dir");

    let (text, reference) = path_reference(&workspace, "src").expect("dir reference");
    assert_eq!(text, "@src");
    assert!(reference.is_dir);
    assert_eq!(reference.mime, None);
    assert_eq!(reference.size, None);

    assert!(path_reference(&workspace, "../escape").is_none());
    assert!(path_reference(&workspace, "missing.rs").is_none());
}

#[test]
fn skill_without_description_still_resolves() {
    let candidate = SkillCandidate {
        name: "plain".to_string(),
        path: std::path::PathBuf::from("/nonexistent/skills/plain"),
    };
    let (text, reference) = skill_reference(&candidate);
    assert!(text.contains("Use the skill \"plain\""));
    assert!(text.contains("SKILL.md"));
    assert_eq!(reference.kind, ReferenceKind::Skill);
    assert_eq!(reference.name, "plain");
}
