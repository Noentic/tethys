//! ACP-Registry engine tests (M1.12 U2), wiremock-backed and sub-second.

use flate2::write::GzEncoder;
use flate2::Compression;
use tethys_agent_servers::registry::{
    compliance_note, install, update_availability, Distribution, InstallOptions, Registry,
    RegistryAgent, RegistryError,
};
use tethys_schema::agents::UpdateAvailability;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const FIXTURE: &str = include_str!("fixtures/registry.json");

fn tar_gz(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let encoder = GzEncoder::new(Vec::new(), Compression::default());
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

fn options(root: &std::path::Path) -> InstallOptions {
    InstallOptions {
        install_root: root.to_path_buf(),
        platform: Some("linux-x86_64".into()),
        node_present: Some(true),
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
async fn unsupported_uvx_and_unsupported_archive_are_typed_errors() {
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
    let error = install(&uvx, None, &options(root.path()))
        .await
        .expect_err("uvx unsupported");
    assert!(matches!(error, RegistryError::UnsupportedDistribution(_)));

    let bz2: RegistryAgent = serde_json::from_value(serde_json::json!({
        "id": "tar-agent",
        "name": "Tar",
        "version": "1.0.0",
        "distribution": { "binary": { "linux-x86_64": {
            "archive": "https://example.test/a.tar.bz2", "cmd": "./a"
        } } },
    }))
    .expect("bz2 agent");
    let error = install(&bz2, None, &options(root.path()))
        .await
        .expect_err("bz2 unsupported");
    assert!(matches!(error, RegistryError::UnsupportedDistribution(_)));

    let error = install(opencode, Some("9.9.9"), &options(root.path()))
        .await
        .expect_err("version unavailable");
    assert!(matches!(error, RegistryError::VersionUnavailable { .. }));
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
        assert!(matches!(
            registry.agent(id).map(|a| &a.distribution),
            Some(Distribution::Npx(_) | Distribution::Binary(_))
        ));
    }
}
