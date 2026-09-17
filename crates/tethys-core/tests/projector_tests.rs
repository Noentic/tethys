use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use tethys_core::projector::{
    ClaudeCodeProjector, CodexProjector, McpServerConfig, OpenCodeProjector, Projector,
};

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("fixtures/projectors")
}

#[test]
fn test_claude_code_projection_roundtrip() {
    let original = fs::read_to_string(fixtures_dir().join("claude_code.json")).expect("read fixture");
    let projector = ClaudeCodeProjector;

    let config = McpServerConfig {
        server_type: "stdio".into(),
        command: Some("tethys-mcp".into()),
        args: vec!["--project".into()],
        url: None,
        env: BTreeMap::new(),
    };

    // 1. Inject
    let injected = projector.inject(&original, "tethys-injected", &config).expect("inject");
    assert!(injected.contains("tethys-injected"));
    assert!(injected.contains("existing_server"));

    // 2. Rollback
    let rolled_back = projector.rollback(&injected, "tethys-injected").expect("rollback");
    assert!(!rolled_back.contains("tethys-injected"));
    assert!(rolled_back.contains("existing_server"));

    // Parse both as JSON to assert structural equivalence
    let v_orig: serde_json::Value = serde_json::from_str(&original).unwrap();
    let v_back: serde_json::Value = serde_json::from_str(&rolled_back).unwrap();
    assert_eq!(v_orig, v_back);
}

#[test]
fn test_codex_toml_projection_roundtrip_with_comments() {
    let original = fs::read_to_string(fixtures_dir().join("codex_config.toml")).expect("read fixture");
    let projector = CodexProjector;

    let config = McpServerConfig {
        server_type: "stdio".into(),
        command: Some("github-mcp".into()),
        args: vec!["stdio".into()],
        url: None,
        env: BTreeMap::new(),
    };

    // 1. Inject
    let injected = projector.inject(&original, "github", &config).expect("inject");
    assert!(injected.contains("[mcp_servers.github]"));
    assert!(injected.contains("[mcp_servers.postgres]"));
    // Comments must be preserved!
    assert!(injected.contains("# Codex CLI Configuration File"));
    assert!(injected.contains("# Pre-existing local database MCP server"));

    // 2. Rollback
    let rolled_back = projector.rollback(&injected, "github").expect("rollback");
    assert!(!rolled_back.contains("[mcp_servers.github]"));
    assert!(rolled_back.contains("[mcp_servers.postgres]"));
    assert!(rolled_back.contains("# Pre-existing local database MCP server"));

    // Exact string match check (no formatting loss)
    assert_eq!(original.trim(), rolled_back.trim());
}

#[test]
fn test_opencode_projection_roundtrip() {
    let original = fs::read_to_string(fixtures_dir().join("opencode.json")).expect("read fixture");
    let projector = OpenCodeProjector;

    let config = McpServerConfig {
        server_type: "stdio".into(),
        command: Some("linear-mcp".into()),
        args: vec![],
        url: None,
        env: BTreeMap::new(),
    };

    // 1. Inject
    let injected = projector.inject(&original, "linear", &config).expect("inject");
    assert!(injected.contains("linear"));
    assert!(injected.contains("git"));

    // 2. Rollback
    let rolled_back = projector.rollback(&injected, "linear").expect("rollback");
    assert!(!rolled_back.contains("linear"));
    assert!(rolled_back.contains("git"));

    let v_orig: serde_json::Value = serde_json::from_str(&original).unwrap();
    let v_back: serde_json::Value = serde_json::from_str(&rolled_back).unwrap();
    assert_eq!(v_orig, v_back);
}
