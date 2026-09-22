//! ACP-Registry engine tests (M1.12 U2), wiremock-backed and sub-second.

use tethys_agent_servers::registry::{
    compliance_note, install, select_distribution, update_availability, HttpRegistrySource,
    InstallOptions, Registry, RegistryAgent, RegistryError, RegistrySource,
};
use tethys_schema::agents::UpdateAvailability;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const FIXTURE: &str = include_str!("fixtures/registry.json");

#[tokio::test]
async fn registry_source_accepts_preview_metadata_and_unknown_fields() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/registry.json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "version": "1.0.0",
            "futureTopLevel": { "keptByPublisher": true },
            "agents": [{
                "id": "future-agent",
                "name": "Future Agent",
                "version": "1.0.0",
                "futureAgentField": [1, 2, 3],
                "distribution": {
                    "npx": {
                        "package": "future-agent@1.0.0",
                        "futureDistributionField": "ignored"
                    }
                },
                "preview": {
                    "version": "1.1.0-beta.1",
                    "distribution": {
                        "npx": { "package": "future-agent@1.1.0-beta.1" }
                    },
                    "futurePreviewField": true
                }
            }],
            "extensions": []
        })))
        .mount(&server)
        .await;

    let source = HttpRegistrySource::new(format!("{}/registry.json", server.uri()))
        .expect("registry source");
    let registry = source.fetch().await.expect("forward-compatible registry");
    let agent = registry.agent("future-agent").expect("agent");
    assert_eq!(
        agent
            .preview
            .as_ref()
            .map(|preview| preview.version.as_str()),
        Some("1.1.0-beta.1"),
    );
}

fn tar_gz(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    let mut builder = tar::Builder::new(encoder);
    for (name, data) in entries {
        let mut header = tar::Header::new_gnu();
        header.set_size(data.len() as u64);
        header.set_mode(0o755);
        header.set_cksum();
        builder
            .append_data(&mut header, name, *data)
            .expect("append");
    }
    builder
        .into_inner()
        .expect("encoder")
        .finish()
        .expect("finish")
}

fn tar_bz2(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let encoder = bzip2::write::BzEncoder::new(Vec::new(), bzip2::Compression::default());
    let mut builder = tar::Builder::new(encoder);
    for (name, data) in entries {
        let mut header = tar::Header::new_gnu();
        header.set_size(data.len() as u64);
        header.set_mode(0o755);
        header.set_cksum();
        builder
            .append_data(&mut header, name, *data)
            .expect("append");
    }
    builder
        .into_inner()
        .expect("encoder")
        .finish()
        .expect("finish")
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn binary_agent(archive: String, sha: Option<String>) -> RegistryAgent {
    let mut target = serde_json::Map::new();
    target.insert("archive".into(), archive.into());
    target.insert("cmd".into(), "./opencode".into());
    target.insert("args".into(), serde_json::json!(["acp"]));
    if let Some(sha) = sha {
        target.insert("sha256".into(), sha.into());
    }
    serde_json::from_value(serde_json::json!({
        "id": "opencode",
        "name": "OpenCode",
        "version": "1.18.31",
        "distribution": { "binary": { "linux-x86_64": target } },
    }))
    .expect("agent")
}

#[test]
fn multi_distribution_selection_is_host_and_runtime_aware() {
    let agent: RegistryAgent = serde_json::from_value(serde_json::json!({
        "id":"multi","name":"Multi","version":"1.0.0",
        "distribution":{
            "binary":{"linux-x86_64":{"archive":"https://example.test/a","cmd":"./a"}},
            "npx":{"package":"multi@1.0.0"},
            "uvx":{"package":"multi==1.0.0"}
        }
    }))
    .expect("agent");

    let binary = select_distribution(&agent.distribution, Some("linux-x86_64"), true, true)
        .expect("binary target wins");
    assert_eq!(binary.kind, "binary");

    let npx = select_distribution(&agent.distribution, Some("windows-x86_64"), true, true)
        .expect("runtime fallback");
    assert_eq!(npx.kind, "npx");
    assert!(npx
        .reason
        .as_deref()
        .unwrap_or_default()
        .contains("no target"));

    let uvx = select_distribution(&agent.distribution, Some("windows-x86_64"), false, true)
        .expect("uv fallback");
    assert_eq!(uvx.kind, "uvx");
    assert!(uvx
        .reason
        .as_deref()
        .unwrap_or_default()
        .contains("npx requires Node.js"));

    let needs_node = select_distribution(&agent.distribution, Some("windows-x86_64"), false, false)
        .expect("runtime prerequisite outcome");
    assert_eq!(needs_node.kind, "npx");
    assert!(needs_node.needs_node);
}

fn options(root: &std::path::Path) -> InstallOptions {
    InstallOptions {
        install_root: root.to_path_buf(),
        platform: Some("linux-x86_64".into()),
        node_present: Some(true),
        uv_present: Some(true),
    }
}

#[tokio::test]
async fn npx_install_pins_the_package_and_reports_missing_node() {
    let registry = Registry::parse(FIXTURE).expect("fixture");
    let claude = registry.agent("claude-acp").expect("claude-acp");
    let root = tempfile::tempdir().expect("tempdir");
    let mut opts = options(root.path());
    opts.node_present = Some(false);

    let outcome = install(claude, None, &opts).await.expect("install");
    assert_eq!(outcome.profile_id, "claude-acp");
    assert_eq!(outcome.launch_spec.program, "npx");
    assert_eq!(outcome.launch_spec.args[0], "-y");
    assert_eq!(
        outcome.launch_spec.args[1],
        "@agentclientprotocol/claude-agent-acp@0.79.0"
    );
    assert_eq!(outcome.registry_ref.version, "0.79.0");
    assert!(outcome.needs_node);
    assert_eq!(outcome.registry_ref.distribution.as_deref(), Some("npx"));
    assert!(outcome.warning.is_none());
}

#[tokio::test]
async fn binary_install_downloads_verifies_extracts_and_marks_executable() {
    let server = MockServer::start().await;
    let archive = tar_gz(&[("./opencode", b"#!/bin/sh\necho hi\n")]);
    Mock::given(method("GET"))
        .and(path("/opencode.tar.gz"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(archive.clone()))
        .mount(&server)
        .await;

    let agent = binary_agent(
        format!("{}/opencode.tar.gz", server.uri()),
        Some(sha256_hex(&archive)),
    );
    let root = tempfile::tempdir().expect("tempdir");
    let outcome = install(&agent, None, &options(root.path()))
        .await
        .expect("install");

    assert!(outcome.launch_spec.program.ends_with("opencode"));
    assert!(outcome.launch_spec.args.contains(&"acp".to_string()));
    assert!(outcome.warning.is_none());
    assert!(!outcome.needs_node);
    let program = std::path::Path::new(&outcome.launch_spec.program);
    assert!(program.exists(), "extracted cmd exists");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(program)
            .expect("meta")
            .permissions()
            .mode();
        assert_eq!(mode & 0o111, 0o111, "cmd is executable");
    }
}

#[tokio::test]
async fn binary_install_rejects_a_mismatched_sha256_and_leaves_nothing() {
    let server = MockServer::start().await;
    let archive = tar_gz(&[("./opencode", b"binary\n")]);
    Mock::given(method("GET"))
        .and(path("/opencode.tar.gz"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(archive.clone()))
        .mount(&server)
        .await;

    let agent = binary_agent(
        format!("{}/opencode.tar.gz", server.uri()),
        Some("00".repeat(32)),
    );
    let root = tempfile::tempdir().expect("tempdir");
    let error = install(&agent, None, &options(root.path()))
        .await
        .expect_err("mismatch");
    assert!(matches!(error, RegistryError::Integrity { .. }));
    assert!(!root.path().join("opencode").exists());
}

#[tokio::test]
async fn binary_install_without_sha256_warns_but_installs() {
    let server = MockServer::start().await;
    let archive = tar_gz(&[("./opencode", b"binary\n")]);
    Mock::given(method("GET"))
        .and(path("/opencode.tar.gz"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(archive.clone()))
        .mount(&server)
        .await;

    let agent = binary_agent(format!("{}/opencode.tar.gz", server.uri()), None);
    let root = tempfile::tempdir().expect("tempdir");
    let outcome = install(&agent, None, &options(root.path()))
        .await
        .expect("install");
    assert!(outcome.warning.is_some(), "unchecksummed install warns");
    assert!(std::path::Path::new(&outcome.launch_spec.program).exists());
}

#[tokio::test]
async fn uvx_install_and_version_pinning_are_typed() {
    let registry = Registry::parse(FIXTURE).expect("fixture");
    let opencode = registry.agent("opencode").expect("opencode");
    let root = tempfile::tempdir().expect("tempdir");

    let uvx: RegistryAgent = serde_json::from_value(serde_json::json!({
        "id": "python-agent",
        "name": "Python",
        "version": "1.0.0",
        "distribution": { "uvx": { "package": "pkg@1.0.0" } },
    }))
    .expect("uvx agent");
    let installed = install(&uvx, None, &options(root.path()))
        .await
        .expect("uvx supported");
    assert_eq!(installed.launch_spec.program, "uvx");
    assert_eq!(installed.launch_spec.args[0], "pkg@1.0.0");

    let mut missing_uv = options(root.path());
    missing_uv.uv_present = Some(false);
    let missing = install(&uvx, None, &missing_uv)
        .await
        .expect("resolvable spec");
    assert!(missing.needs_uvx);

    let error = install(opencode, Some("9.9.9"), &options(root.path()))
        .await
        .expect_err("version unavailable");
    assert!(matches!(error, RegistryError::VersionUnavailable { .. }));
}

#[tokio::test]
async fn tar_bz2_and_raw_binary_archives_install() {
    let server = MockServer::start().await;
    let archive = tar_bz2(&[("./opencode", b"#!/bin/sh\nexit 0\n")]);
    Mock::given(method("GET"))
        .and(path("/opencode.tar.bz2"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(archive.clone()))
        .mount(&server)
        .await;
    let root = tempfile::tempdir().expect("tempdir");
    let outcome = install(
        &binary_agent(
            format!("{}/opencode.tar.bz2", server.uri()),
            Some(sha256_hex(&archive)),
        ),
        None,
        &options(root.path()),
    )
    .await
    .expect("tar.bz2 install");
    assert!(std::path::Path::new(&outcome.launch_spec.program).is_file());

    Mock::given(method("GET"))
        .and(path("/opencode.raw"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(b"raw binary".to_vec()))
        .mount(&server)
        .await;
    let raw = binary_agent(format!("{}/opencode.raw", server.uri()), None);
    let outcome = install(&raw, None, &options(root.path()))
        .await
        .expect("raw install");
    assert_eq!(
        std::fs::read(&outcome.launch_spec.program).expect("raw payload"),
        b"raw binary"
    );
}

#[tokio::test]
async fn failed_update_keeps_the_previous_binary_available() {
    let server = MockServer::start().await;
    let valid = tar_gz(&[("./opencode", b"old binary")]);
    Mock::given(method("GET"))
        .and(path("/valid.tar.gz"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(valid.clone()))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/invalid.tar.gz"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(b"bad archive".to_vec()))
        .mount(&server)
        .await;

    let root = tempfile::tempdir().expect("tempdir");
    let first = install(
        &binary_agent(
            format!("{}/valid.tar.gz", server.uri()),
            Some(sha256_hex(&valid)),
        ),
        None,
        &options(root.path()),
    )
    .await
    .expect("first install");
    let error = install(
        &binary_agent(
            format!("{}/invalid.tar.gz", server.uri()),
            Some(sha256_hex(b"bad archive")),
        ),
        None,
        &options(root.path()),
    )
    .await
    .expect_err("invalid archive");
    assert!(matches!(error, RegistryError::Install(_)));
    assert_eq!(
        std::fs::read(first.launch_spec.program).expect("preserved install"),
        b"old binary"
    );
}

#[tokio::test]
async fn binary_command_path_cannot_escape_staging_directory() {
    let agent: RegistryAgent = serde_json::from_value(serde_json::json!({
        "id":"bad-path","name":"Bad","version":"1.0.0",
        "distribution":{"binary":{"linux-x86_64":{"archive":"https://example.test/payload","cmd":"../outside"}}}
    })).expect("agent");
    let root = tempfile::tempdir().expect("tempdir");
    let error = install(&agent, None, &options(root.path()))
        .await
        .expect_err("reject path before download");
    assert!(matches!(error, RegistryError::Install(_)));
}

#[tokio::test]
async fn network_failure_surfaces_as_a_typed_error() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/opencode.tar.gz"))
        .respond_with(ResponseTemplate::new(503))
        .mount(&server)
        .await;

    let agent = binary_agent(
        format!("{}/opencode.tar.gz", server.uri()),
        Some("00".repeat(32)),
    );
    let root = tempfile::tempdir().expect("tempdir");
    let error = install(&agent, None, &options(root.path()))
        .await
        .expect_err("503");
    assert!(matches!(error, RegistryError::Fetch(_)));
}

#[test]
fn pin_survives_an_upstream_release() {
    // The stored spec is what resolves; the registry only reports availability.
    let pinned = "1.18.31";
    let available = update_availability(pinned, "1.19.0");
    assert_eq!(
        available,
        UpdateAvailability::Available {
            latest: "1.19.0".into()
        }
    );
    assert_eq!(
        update_availability(pinned, pinned),
        UpdateAvailability::UpToDate
    );
}

#[test]
fn compliance_notes_reflect_the_matrix() {
    assert!(compliance_note("antigravity-acp").is_some());
    assert!(compliance_note("claude-acp").is_none());
}

#[test]
fn fixture_agent_ids_are_present() {
    let registry = Registry::parse(FIXTURE).expect("fixture");
    for id in ["claude-acp", "opencode", "antigravity-acp"] {
        let distribution = &registry.agent(id).expect("entry").distribution;
        assert!(!distribution.is_empty());
    }
}
