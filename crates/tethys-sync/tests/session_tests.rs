use std::collections::BTreeSet;
use std::fs;

use tethys_schema::sync::{McpTransports, RegistryValue};
use tethys_sync::secrets::MemorySecrets;
use tethys_sync::session::spawn_servers;
use tethys_sync::SyncError;

const GLOBAL: &str = r#"{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "github-mcp-server",
      "args": ["stdio"],
      "env": { "GITHUB_TOKEN": { "secretRef": "keychain:tethys/github" } },
      "x-tethys": { "targets": ["session"] }
    },
    "linear": {
      "type": "http",
      "url": "https://mcp.linear.app/mcp",
      "x-tethys": { "targets": ["session"] }
    }
  }
}"#;

#[test]
fn spawn_resolves_secrets_without_touching_files() {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().join("home");
    let workdir = dir.path().join("repo");
    fs::create_dir_all(home.join(".tethys")).expect("home");
    fs::create_dir_all(workdir.join(".tethys")).expect("repo");
    let global = home.join(".tethys").join("mcp.json");
    fs::write(&global, GLOBAL).expect("write registry");
    let before = fs::read(&global).expect("read registry");

    let store = MemorySecrets::new();
    store.insert("github", "sentinel-secret-value");

    let servers = spawn_servers(
        &home,
        &workdir,
        &BTreeSet::new(),
        &McpTransports {
            stdio: true,
            http: true,
            sse: false,
        },
        &store,
    )
    .expect("spawn");

    assert_eq!(servers.len(), 2);
    let github = servers
        .iter()
        .find(|server| server.name == "github")
        .expect("github");
    assert_eq!(
        github.env.get("GITHUB_TOKEN"),
        Some(&RegistryValue::plain("sentinel-secret-value"))
    );

    assert_eq!(fs::read(&global).expect("reread"), before);
    let text = String::from_utf8(before).expect("utf8");
    assert!(!text.contains("sentinel-secret-value"));
    assert!(!workdir.join(".tethys").join("mcp.json").exists());
}

#[test]
fn spawn_errors_list_every_missing_ref() {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().join("home");
    let workdir = dir.path().join("repo");
    fs::create_dir_all(home.join(".tethys")).expect("home");
    fs::write(home.join(".tethys").join("mcp.json"), GLOBAL).expect("write");

    let error = spawn_servers(
        &home,
        &workdir,
        &BTreeSet::new(),
        &McpTransports::all(),
        &MemorySecrets::new(),
    )
    .expect_err("missing secret");
    match error {
        SyncError::MissingSecrets { refs } => {
            assert_eq!(refs, vec!["keychain:tethys/github".to_string()]);
        }
        other => panic!("unexpected error: {other}"),
    }
}

#[test]
fn spawn_respects_thread_disables() {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().join("home");
    let workdir = dir.path().join("repo");
    fs::create_dir_all(home.join(".tethys")).expect("home");
    fs::write(home.join(".tethys").join("mcp.json"), GLOBAL).expect("write");

    let disabled: BTreeSet<String> = ["github".to_string()].into();
    let servers = spawn_servers(
        &home,
        &workdir,
        &disabled,
        &McpTransports::all(),
        &MemorySecrets::new(),
    )
    .expect("spawn");
    let names: Vec<&str> = servers.iter().map(|server| server.name.as_str()).collect();
    assert_eq!(names, vec!["linear"]);
}

#[test]
fn sentinel_never_reaches_vendor_files_or_backups() {
    use tethys_schema::sync::{RegistryEntry, Scope, TransportKind};
    use tethys_sync::projection::{apply, plan, ApplyRequest, PlanRequest};
    use tethys_sync::ClaudeCodeProjector;

    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().join("home");
    let workdir = dir.path().join("repo");
    fs::create_dir_all(home.join(".tethys")).expect("home");
    fs::write(home.join(".tethys").join("mcp.json"), GLOBAL).expect("registry");
    fs::create_dir_all(&workdir).expect("repo");

    let store = MemorySecrets::new();
    store.insert("github", "sentinel-secret-value");
    let servers = spawn_servers(
        &home,
        &workdir,
        &BTreeSet::new(),
        &McpTransports::all(),
        &store,
    )
    .expect("spawn");
    assert!(servers
        .iter()
        .flat_map(|server| server.env.values())
        .any(|value| value.as_plain() == Some("sentinel-secret-value")));

    let entry = RegistryEntry {
        transport: TransportKind::Stdio,
        command: Some("github-mcp-server".into()),
        args: vec!["stdio".into()],
        env: std::collections::BTreeMap::from([(
            "GITHUB_TOKEN".to_string(),
            RegistryValue::secret("keychain:tethys/github"),
        )]),
        url: None,
        headers: std::collections::BTreeMap::new(),
        meta: Default::default(),
    };
    let desired = vec![("github".to_string(), entry.clone())];
    let path = workdir.join(".mcp.json");
    let projector = ClaudeCodeProjector;

    let first = plan(PlanRequest {
        projector: &projector,
        path: &path,
        scope: Scope::Project,
        original: None,
        desired: &desired,
        owned: &Default::default(),
    })
    .expect("plan");
    let applied = apply(ApplyRequest {
        projector: &projector,
        plan: &first,
        home: &home,
    })
    .expect("apply");

    let mut changed = entry;
    changed.args = vec!["stdio".into(), "--verbose".into()];
    let second = plan(PlanRequest {
        projector: &projector,
        path: &path,
        scope: Scope::Project,
        original: Some(&fs::read_to_string(&path).expect("read")),
        desired: &[("github".to_string(), changed)],
        owned: &applied.entries,
    })
    .expect("replan");
    apply(ApplyRequest {
        projector: &projector,
        plan: &second,
        home: &home,
    })
    .expect("reapply");

    let vendor = fs::read_to_string(&path).expect("vendor");
    assert!(vendor.contains("${GITHUB_TOKEN}"));
    assert!(!vendor.contains("sentinel-secret-value"));

    let backups = tethys_sync::atomic::backup_dir(&home, &path);
    let mut checked = 0;
    for entry in fs::read_dir(&backups).expect("backups") {
        let text = fs::read_to_string(entry.expect("entry").path()).expect("backup text");
        assert!(!text.contains("sentinel-secret-value"));
        checked += 1;
    }
    assert!(checked > 0, "expected at least one backup");
}
