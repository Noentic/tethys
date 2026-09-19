use std::collections::{BTreeMap, BTreeSet};
use std::fs;

use tethys_schema::sync::{
    EntryMeta, McpTransports, RegistryEntry, RegistryValue, Scope, TargetId, TransportKind,
};
use tethys_sync::registry::{read_registry, write_registry, Registry, RegistryFile};
use tethys_sync::secrets::{MemorySecrets, SecretStore};
use tethys_sync::{resolve_secrets, session_servers, SyncError};

const CANONICAL: &str = r#"{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "github-mcp-server",
      "args": ["stdio"],
      "env": { "GITHUB_TOKEN": { "secretRef": "keychain:tethys/github" } },
      "x-tethys": { "scope": "global", "targets": ["session", "claude-code", "codex"], "enabled": true }
    },
    "linear": {
      "type": "http",
      "url": "https://mcp.linear.app/mcp",
      "x-tethys": { "targets": ["session"] }
    }
  }
}"#;

const PROJECT: &str = r#"{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "project-github",
      "x-tethys": { "scope": "project", "enabled": true }
    },
    "disabled": {
      "type": "stdio",
      "command": "nope",
      "x-tethys": { "enabled": false }
    }
  }
}"#;

fn registry_from(global: &str, project: &str) -> Registry {
    let dir = tempfile::tempdir().expect("tempdir");
    let global_path = dir.path().join("global.json");
    let project_path = dir.path().join("project.json");
    fs::write(&global_path, global).expect("write global");
    fs::write(&project_path, project).expect("write project");
    Registry::load(Some(&global_path), Some(&project_path)).expect("load")
}

#[test]
fn project_overrides_global_and_filters_targets() {
    let registry = registry_from(CANONICAL, PROJECT);
    let effective = registry.effective(TargetId::ClaudeCode, &BTreeSet::new());
    let names: Vec<&str> = effective.iter().map(|(name, _)| name.as_str()).collect();
    assert_eq!(names, vec!["github"]);
    let github = &effective[0].1;
    assert_eq!(github.command.as_deref(), Some("project-github"));

    let session = registry.effective(TargetId::Session, &BTreeSet::new());
    let names: Vec<&str> = session.iter().map(|(name, _)| name.as_str()).collect();
    assert_eq!(names, vec!["github", "linear"]);

    let codex = registry.effective(TargetId::Codex, &BTreeSet::new());
    let names: Vec<&str> = codex.iter().map(|(name, _)| name.as_str()).collect();
    assert_eq!(names, vec!["github"]);

    let opencode = registry.effective(TargetId::OpenCode, &BTreeSet::new());
    let names: Vec<&str> = opencode.iter().map(|(name, _)| name.as_str()).collect();
    assert_eq!(names, vec!["github"]);
}

#[test]
fn disabled_entries_and_overrides_are_excluded() {
    let registry = registry_from(CANONICAL, PROJECT);
    let disabled: BTreeSet<String> = ["github".to_string()].into();
    let effective = registry.effective(TargetId::Session, &disabled);
    let names: Vec<&str> = effective.iter().map(|(name, _)| name.as_str()).collect();
    assert_eq!(names, vec!["linear"]);
}

#[test]
fn v2_transports_drop_unsupported_entries() {
    let registry = registry_from(CANONICAL, "");
    let effective = registry.effective(TargetId::Session, &BTreeSet::new());

    let no_http = session_servers(
        &effective,
        &McpTransports {
            stdio: true,
            http: false,
            sse: false,
        },
    );
    let names: Vec<&str> = no_http.iter().map(|server| server.name.as_str()).collect();
    assert_eq!(names, vec!["github"]);

    let no_stdio = session_servers(
        &effective,
        &McpTransports {
            stdio: false,
            http: true,
            sse: false,
        },
    );
    let names: Vec<&str> = no_stdio.iter().map(|server| server.name.as_str()).collect();
    assert_eq!(names, vec!["linear"]);
}

#[test]
fn v1_sse_is_kept_only_when_advertised() {
    let registry = registry_from(CANONICAL, "");
    let mut effective = registry.effective(TargetId::Session, &BTreeSet::new());
    effective.push((
        "legacy".to_string(),
        RegistryEntry {
            transport: TransportKind::Sse,
            command: None,
            args: vec![],
            env: BTreeMap::new(),
            url: Some("https://legacy.example.com/sse".into()),
            headers: BTreeMap::new(),
            meta: EntryMeta::default(),
        },
    ));

    let without_sse = session_servers(
        &effective,
        &McpTransports {
            stdio: true,
            http: true,
            sse: false,
        },
    );
    assert!(!without_sse.iter().any(|server| server.name == "legacy"));

    let with_sse = session_servers(
        &effective,
        &McpTransports {
            stdio: true,
            http: true,
            sse: true,
        },
    );
    assert!(with_sse.iter().any(|server| server.name == "legacy"));
}

#[test]
fn resolve_secrets_replaces_refs_and_lists_missing() {
    let registry = registry_from(CANONICAL, "");
    let effective = registry.effective(TargetId::Session, &BTreeSet::new());
    let servers = session_servers(&effective, &McpTransports::all());

    let store = MemorySecrets::new();
    store.insert("github", "ghp_sentinel_value");
    let resolved = resolve_secrets(&servers, &store).expect("resolve");
    let github = resolved
        .iter()
        .find(|server| server.name == "github")
        .expect("github");
    assert_eq!(
        github.env.get("GITHUB_TOKEN"),
        Some(&RegistryValue::plain("ghp_sentinel_value"))
    );

    let empty = MemorySecrets::new();
    let error = resolve_secrets(&servers, &empty).expect_err("missing");
    match error {
        SyncError::MissingSecrets { refs } => {
            assert_eq!(refs, vec!["keychain:tethys/github".to_string()]);
        }
        other => panic!("unexpected error: {other}"),
    }
}

#[test]
fn registry_round_trips_with_metadata() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join(".tethys").join("mcp.json");
    let file: RegistryFile = serde_json::from_str(CANONICAL).expect("parse");
    write_registry(&path, &file, Some(dir.path())).expect("write");

    let reloaded = read_registry(&path).expect("read").expect("present");
    assert_eq!(reloaded, file);

    let entry = reloaded.mcp_servers.get("linear").expect("linear");
    assert_eq!(entry.meta.targets, Some(vec![TargetId::Session]));
    assert_eq!(entry.meta.scope, None);
}

#[test]
fn missing_registry_file_is_empty() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("absent.json");
    assert!(read_registry(&path).expect("read").is_none());
    let registry = Registry::load(Some(&path), None).expect("load");
    assert!(registry
        .effective(TargetId::Session, &BTreeSet::new())
        .is_empty());
}

#[test]
fn memory_store_round_trips() {
    let store = MemorySecrets::new();
    assert_eq!(store.get("account").expect("get"), None);
    store.set("account", "value").expect("set");
    assert_eq!(store.get("account").expect("get").as_deref(), Some("value"));
    store.delete("account").expect("delete");
    assert_eq!(store.get("account").expect("get"), None);
}

#[test]
fn legacy_scope_project_still_loads() {
    let json = r#"{"type":"stdio","command":"cmd","x-tethys":{"scope":"project"}}"#;
    let entry: RegistryEntry = serde_json::from_str(json).expect("parse entry");
    assert_eq!(entry.meta.scope, Some(Scope::Workspace));
}

