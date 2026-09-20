use std::fs;
use std::path::Path;

use tethys_schema::sync::{EntryMeta, Scope, TransportKind};
use tethys_sync::import::{apply_import, scan, ScanRequest};
use tethys_sync::registry::read_registry;

fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().expect("parent")).expect("dirs");
    fs::write(path, text).expect("write");
}

fn setup() -> (tempfile::TempDir, std::path::PathBuf, std::path::PathBuf) {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().join("home");
    let root = dir.path().join("repo");
    fs::create_dir_all(&root).expect("root");

    write(
        &root.join(".mcp.json"),
        r#"{"mcpServers":{"server_a":{"type":"stdio","command":"a"}}}"#,
    );
    write(
        &home.join(".claude.json"),
        &format!(
            r#"{{
  "mcpServers": {{"server_b": {{"type": "http", "url": "https://b.example.com"}}}},
  "projects": {{
    {:?}: {{"mcpServers": {{"server_c": {{"type": "stdio", "command": "c"}}}}}}
  }}
}}"#,
            root.display()
        ),
    );
    write(
        &home.join(".codex/config.toml"),
        "[mcp_servers.server_d]\ncommand = \"d\"\n",
    );
    write(
        &root.join("opencode.json"),
        r#"{"mcp":{"servers":{"server_e":{"type":"local","command":["e"]}}}}"#,
    );
    write(
        &home.join(".config/opencode/opencode.json"),
        r#"{"mcp":{"server_f":{"type":"stdio","command":"f"}}}"#,
    );
    (dir, home, root)
}

#[test]
fn scan_reads_every_source_without_writing() {
    let (dir, home, root) = setup();
    let before: Vec<(std::path::PathBuf, Vec<u8>)> = [
        root.join(".mcp.json"),
        home.join(".claude.json"),
        home.join(".codex/config.toml"),
        root.join("opencode.json"),
        home.join(".config/opencode/opencode.json"),
    ]
    .iter()
    .map(|path| (path.clone(), fs::read(path).expect("read")))
    .collect();

    let scan = scan(ScanRequest {
        root: &root,
        home: &home,
    });
    assert!(scan.failures.is_empty(), "failures: {:?}", scan.failures);
    let names: Vec<&str> = scan
        .candidates
        .iter()
        .map(|candidate| candidate.name.as_str())
        .collect();
    for expected in [
        "server_a", "server_b", "server_c", "server_d", "server_e", "server_f",
    ] {
        assert!(names.contains(&expected), "missing {expected} in {names:?}");
    }

    let server_c = scan
        .candidates
        .iter()
        .find(|candidate| candidate.name == "server_c")
        .expect("server_c");
    assert_eq!(server_c.scope, Scope::Workspace);
    assert!(server_c.source_path.contains("#projects["));

    let server_f = scan
        .candidates
        .iter()
        .find(|candidate| candidate.name == "server_f")
        .expect("server_f");
    assert!(server_f.entry.meta.legacy);

    for (path, bytes) in before {
        assert_eq!(
            fs::read(&path).expect("reread"),
            bytes,
            "{} changed",
            path.display()
        );
    }
    drop(dir);
}

#[test]
fn malformed_source_is_isolated() {
    let (_dir, home, root) = setup();
    write(&root.join(".mcp.json"), "{ not json");

    let scan = scan(ScanRequest {
        root: &root,
        home: &home,
    });
    assert_eq!(scan.failures.len(), 1);
    assert!(scan.failures[0].source_path.ends_with(".mcp.json"));
    assert!(scan
        .candidates
        .iter()
        .any(|candidate| candidate.name == "server_d"));
}

#[test]
fn same_name_different_configs_are_conflicts() {
    let (_dir, home, root) = setup();
    write(
        &root.join("opencode.json"),
        r#"{"mcp":{"servers":{"server_a":{"type":"local","command":["different"]}}}}"#,
    );

    let scan = scan(ScanRequest {
        root: &root,
        home: &home,
    });
    let server_a: Vec<_> = scan
        .candidates
        .iter()
        .filter(|candidate| candidate.name == "server_a")
        .collect();
    assert_eq!(server_a.len(), 2);
    assert!(server_a.iter().all(|candidate| candidate.conflict));
}

#[test]
fn apply_writes_metadata_and_preserves_existing_entries() {
    let (dir, home, root) = setup();
    let registry_path = home.join(".tethys/mcp.json");
    write(
        &registry_path,
        r#"{"mcpServers":{"keep":{"type":"stdio","command":"keep"}}}"#,
    );

    let scan = scan(ScanRequest {
        root: &root,
        home: &home,
    });
    let selection: Vec<_> = scan
        .candidates
        .iter()
        .filter(|candidate| candidate.name == "server_a" || candidate.name == "server_b")
        .cloned()
        .collect();
    let names =
        apply_import(&registry_path, &selection, Scope::Workspace, Some(&home)).expect("apply");
    assert_eq!(names.len(), 2);

    let file = read_registry(&registry_path)
        .expect("read")
        .expect("present");
    assert!(file.mcp_servers.contains_key("keep"));
    let server_a = file.mcp_servers.get("server_a").expect("server_a");
    assert_eq!(server_a.meta.scope, Some(Scope::Workspace));
    assert!(server_a.meta.enabled);
    assert_eq!(server_a.transport, TransportKind::Stdio);

    let server_b = file.mcp_servers.get("server_b").expect("server_b");
    assert_eq!(server_b.transport, TransportKind::Http);
    assert_eq!(server_b.url.as_deref(), Some("https://b.example.com"));
    assert_eq!(
        server_b.meta,
        EntryMeta {
            scope: Some(Scope::Workspace),
            providers: None,
            targets: None,
            enabled: true,
            legacy: false,
        }
    );
    drop(dir);
}
