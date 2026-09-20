use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use tethys_schema::sync::{EntryMeta, RegistryEntry, RegistryValue, TransportKind};
use tethys_sync::{ClaudeCodeProjector, CodexProjector, OpenCodeProjector, Projector, SyncError};

fn fixture(name: &str) -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/projectors")
        .join(name);
    fs::read_to_string(path).expect("read fixture")
}

fn stdio(command: &str, args: &[&str], env: BTreeMap<String, RegistryValue>) -> RegistryEntry {
    RegistryEntry {
        transport: TransportKind::Stdio,
        command: Some(command.to_string()),
        args: args.iter().map(|arg| arg.to_string()).collect(),
        env,
        url: None,
        headers: BTreeMap::new(),
        meta: EntryMeta::default(),
    }
}

fn http(url: &str, headers: BTreeMap<String, RegistryValue>) -> RegistryEntry {
    RegistryEntry {
        transport: TransportKind::Http,
        command: None,
        args: vec![],
        env: BTreeMap::new(),
        url: Some(url.to_string()),
        headers,
        meta: EntryMeta::default(),
    }
}

fn secret(value: &str) -> RegistryValue {
    RegistryValue::secret(value)
}

#[test]
fn claude_round_trips_byte_for_byte() {
    let original = fixture("claude_code.json");
    let mut env = BTreeMap::new();
    env.insert("GITHUB_TOKEN".to_string(), secret("keychain:tethys/github"));
    env.insert("PLAIN".to_string(), RegistryValue::plain("value"));
    let entry = stdio("github-mcp-server", &["stdio"], env);

    let injected = ClaudeCodeProjector
        .inject(&original, "github", &entry)
        .expect("inject");
    assert!(injected.contains("\"${GITHUB_TOKEN}\""));
    assert!(injected.contains("\"existing_server\""));

    let rolled_back = ClaudeCodeProjector
        .rollback(&injected, "github")
        .expect("rollback");
    assert_eq!(original.trim_end(), rolled_back.trim_end());
}

#[test]
fn claude_preserves_foreign_keys_and_order() {
    let original = fixture("claude_code.json");
    let injected = ClaudeCodeProjector
        .inject(
            &original,
            "linear",
            &http("https://mcp.linear.app/mcp", BTreeMap::new()),
        )
        .expect("inject");
    let permissions = injected.find("\"permissions\"").expect("permissions key");
    let servers = injected.find("\"mcpServers\"").expect("mcpServers key");
    assert!(permissions < servers, "foreign key order must survive");
    assert!(injected.contains("\"MEMORY_DIR\""));
}

#[test]
fn claude_empty_file_creates_minimal_structure() {
    let injected = ClaudeCodeProjector
        .inject(
            "",
            "linear",
            &http("https://mcp.linear.app/mcp", BTreeMap::new()),
        )
        .expect("inject");
    assert!(injected.contains("\"mcpServers\""));
    assert!(injected.contains("\"type\": \"http\""));
    let rolled_back = ClaudeCodeProjector
        .rollback(&injected, "linear")
        .expect("rollback");
    assert_eq!("{}", rolled_back.trim());
}

#[test]
fn codex_round_trips_with_comments_and_env_table() {
    let original = fixture("codex_config.toml");
    let mut env = BTreeMap::new();
    env.insert("GITHUB_TOKEN".to_string(), secret("keychain:tethys/github"));
    let entry = stdio("github-mcp-server", &["stdio"], env);

    let injected = CodexProjector
        .inject(&original, "github", &entry)
        .expect("inject");
    assert!(injected.contains("[mcp_servers.github]"));
    assert!(injected.contains("# Codex CLI Configuration File"));
    assert!(injected.contains("[mcp_servers.postgres]"));
    assert!(
        !injected.contains("GITHUB_TOKEN"),
        "secret env must not be written"
    );

    let rolled_back = CodexProjector
        .rollback(&injected, "github")
        .expect("rollback");
    assert_eq!(original.trim_end(), rolled_back.trim_end());
}

#[test]
fn codex_http_uses_bearer_token_env_var() {
    let original = fixture("codex_config.toml");
    let mut env = BTreeMap::new();
    env.insert("LINEAR_TOKEN".to_string(), secret("keychain:tethys/linear"));
    let mut entry = http("https://mcp.linear.app/mcp", BTreeMap::new());
    entry.env = env;

    let injected = CodexProjector
        .inject(&original, "linear", &entry)
        .expect("inject");
    assert!(injected.contains("url = \"https://mcp.linear.app/mcp\""));
    assert!(injected.contains("bearer_token_env_var = \"LINEAR_TOKEN\""));
}

#[test]
fn opencode_v2_shape_round_trips_byte_for_byte() {
    let original = fixture("opencode.json");
    let mut env = BTreeMap::new();
    env.insert("GITHUB_TOKEN".to_string(), secret("keychain:tethys/github"));
    let entry = stdio("github-mcp-server", &["stdio", "--verbose"], env);

    let injected = OpenCodeProjector
        .inject(&original, "github", &entry)
        .expect("inject");
    assert!(injected.contains("\"servers\""));
    assert!(injected.contains("\"type\": \"local\""));
    assert!(injected.contains("\"command\": ["));
    assert!(injected.contains("\"{env:GITHUB_TOKEN}\""));

    let rolled_back = OpenCodeProjector
        .rollback(&injected, "github")
        .expect("rollback");
    assert_eq!(original.trim_end(), rolled_back.trim_end());
}

#[test]
fn opencode_jsonc_comments_survive() {
    let original = fixture("opencode.jsonc");
    let entry = http("https://mcp.linear.app/mcp", BTreeMap::new());

    let injected = OpenCodeProjector
        .inject(&original, "linear", &entry)
        .expect("inject");
    assert!(injected.contains("// User overrides"));
    assert!(injected.contains("// hosted endpoint"));
    assert!(injected.contains("\"type\": \"remote\""));

    let rolled_back = OpenCodeProjector
        .rollback(&injected, "linear")
        .expect("rollback");
    assert_eq!(original.trim_end(), rolled_back.trim_end());
}

#[test]
fn opencode_reads_v2_and_legacy_shapes() {
    let v2 = fixture("opencode.json");
    let entries = OpenCodeProjector.read_entries(&v2).expect("read");
    let git = entries.get("git").expect("git entry");
    assert_eq!(git.transport, TransportKind::Stdio);
    assert_eq!(git.command.as_deref(), Some("git-mcp"));
    assert_eq!(
        git.env
            .get("GIT_AUTHOR_NAME")
            .and_then(RegistryValue::as_plain),
        Some("Tethys")
    );

    let legacy = r#"{"mcp":{"git":{"type":"stdio","command":"git-mcp","args":["--verbose"]}}}"#;
    let entries = OpenCodeProjector.read_entries(legacy).expect("read");
    let git = entries.get("git").expect("git entry");
    assert_eq!(git.args, vec!["--verbose"]);
}

#[test]
fn read_entries_maps_indirection_to_keychain_refs() {
    let original = fixture("claude_code.json");
    let injected = ClaudeCodeProjector
        .inject(
            &original,
            "github",
            &stdio(
                "github-mcp-server",
                &[],
                BTreeMap::from([("GITHUB_TOKEN".to_string(), secret("keychain:tethys/github"))]),
            ),
        )
        .expect("inject");
    let entries = ClaudeCodeProjector.read_entries(&injected).expect("read");
    let github = entries.get("github").expect("github entry");
    assert_eq!(
        github
            .env
            .get("GITHUB_TOKEN")
            .and_then(RegistryValue::secret_ref),
        Some("keychain:tethys/GITHUB_TOKEN")
    );
}

#[test]
fn sse_is_never_projected() {
    let entry = RegistryEntry {
        transport: TransportKind::Sse,
        command: Some("legacy".into()),
        args: vec![],
        env: BTreeMap::new(),
        url: Some("https://legacy.example.com/sse".into()),
        headers: BTreeMap::new(),
        meta: EntryMeta::default(),
    };
    for projector in [
        Box::new(ClaudeCodeProjector) as Box<dyn Projector>,
        Box::new(CodexProjector),
        Box::new(OpenCodeProjector),
    ] {
        let error = projector
            .inject("{}", "legacy", &entry)
            .expect_err("sse rejected");
        assert!(matches!(error, SyncError::Unsupported(_)));
    }
}

#[test]
fn foreign_sections_preserved_for_codex_and_opencode() {
    // Codex: foreign table outside mcp_servers preserved
    let codex_original =
        "[general]\nmodel = \"gpt-4\"\n\n[mcp_servers.postgres]\ncommand = \"psql\"\n";
    let codex_injected = CodexProjector
        .inject(
            codex_original,
            "github",
            &stdio("github-mcp", &[], BTreeMap::new()),
        )
        .expect("inject codex");
    assert!(codex_injected.contains("[general]"));
    assert!(codex_injected.contains("model = \"gpt-4\""));
    assert!(codex_injected.contains("[mcp_servers.postgres]"));

    let codex_rolled_back = CodexProjector
        .rollback(&codex_injected, "github")
        .expect("rollback codex");
    assert_eq!(codex_original.trim_end(), codex_rolled_back.trim_end());

    // OpenCode: foreign root keys preserved
    let opencode_original = "{\n  \"model\": \"claude-3-5-sonnet\",\n  \"servers\": {\n    \"existing\": { \"type\": \"local\", \"command\": [\"existing\"] }\n  }\n}";
    let opencode_injected = OpenCodeProjector
        .inject(
            opencode_original,
            "github",
            &stdio("github-mcp", &[], BTreeMap::new()),
        )
        .expect("inject opencode");
    assert!(opencode_injected.contains("\"model\": \"claude-3-5-sonnet\""));
    assert!(opencode_injected.contains("\"existing\""));

    let opencode_rolled_back = OpenCodeProjector
        .rollback(&opencode_injected, "github")
        .expect("rollback opencode");
    assert_eq!(
        opencode_original.trim_end(),
        opencode_rolled_back.trim_end()
    );
}
