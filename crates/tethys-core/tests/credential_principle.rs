//! Credential-principle audit (G7, M1.12 U9).
//!
//! A full profile + login round-trip must leave no credential value in the
//! store, in any event, or in any profile column. Tethys only ever holds a
//! `keychain:` reference.

use std::path::PathBuf;
use std::sync::Arc;

use futures::stream::StreamExt;
use tethys_acp::mock::MOCK_ENV;
use tethys_agent_servers::{ConnectionStore, StoreOptions};
use tethys_api::{AgentApi, ApiError, EventsApi, ThreadApi};
use tethys_core::env_secrets::KeychainEnv;
use tethys_core::permission::DenyPermissionResolver;
use tethys_core::thread_session::{SyncSource, ThreadSessions};
use tethys_core::Core;
use tethys_schema::agents::{EnvVarInput, LaunchSpecInput, ProfileInput, ProviderHealth};
use tethys_schema::connection::AcpProtocol;
use tethys_schema::thread::{ContentBlock, CreateThread};
use tethys_sync::secrets::{MemorySecrets, SecretStore};

const SENTINEL: &str = "super-secret-credential-value";

fn main() {
    if tethys_acp::mock::run_if_requested() {
        return;
    }
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("runtime");
    runtime.block_on(run());
    println!("credential principle audit passed");
}

fn workdir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("tethys-g7-{name}"));
    std::fs::create_dir_all(&dir).expect("workdir");
    dir
}

async fn run() {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path().to_path_buf();
    let store = Arc::new(
        tethys_store::EventStore::open(home.join("state.db"))
            .await
            .expect("store"),
    );
    let secrets = Arc::new(MemorySecrets::new());
    let mut options = StoreOptions::new(AcpProtocol::V1, Arc::new(DenyPermissionResolver));
    options.env_resolver = Arc::new(KeychainEnv::new(secrets.clone()));
    let sessions = Arc::new(ThreadSessions::new(
        ConnectionStore::new(options),
        SyncSource::new(&home, secrets.clone()),
        Arc::new(
            tethys_core::workspace_roots::StaticWorkspaces::new()
                .with("workspace", workdir("workspace")),
        ),
    ));
    let core = Core::with_sessions("test", sessions).with_store(store.clone());
    store
        .ensure_workspace(
            "workspace",
            &workdir("workspace").display().to_string(),
            "worktree",
        )
        .await
        .expect("workspace row");
    // M1.16's trust gate: the roots resolver refuses an untrusted workspace.
    store
        .upsert_trust(tethys_store::TrustRow {
            workspace_id: "workspace".into(),
            resolved_path: workdir("workspace")
                .canonicalize()
                .expect("canonicalize")
                .to_string_lossy()
                .to_string(),
            host: "local".into(),
            remote_url: None,
            permission_mode: "supervised".into(),
            scope: "folder".into(),
            trusted_at: 0,
        })
        .await
        .expect("trust");

    // A manual profile; the credential enters through the write-only host
    // method, exactly as the env-var login form does.
    let created = core
        .agent_profiles_create(ProfileInput {
            id: Some("audit".into()),
            name: "Audit".into(),
            launch_spec: LaunchSpecInput {
                program: std::env::current_exe()
                    .expect("exe")
                    .to_string_lossy()
                    .to_string(),
                args: vec![],
                cwd: None,
                // `MOCK_ENV` makes the re-executed test binary act as the mock
                // agent; without it the child would re-run this whole audit.
                env: vec![
                    EnvVarInput {
                        key: MOCK_ENV.into(),
                        value: "v1".into(),
                    },
                    EnvVarInput {
                        key: "TETHYS_MOCK_AUTH".into(),
                        value: "agent".into(),
                    },
                ],
            },
            projection_target: None,
            preferred_protocol: Some(AcpProtocol::V1),
            enabled: true,
        })
        .await
        .expect("create profile");
    assert_eq!(created.id, "audit");

    let updated = core
        .agent_env_secret_set("audit".into(), "API_KEY".into(), SENTINEL.into())
        .await
        .expect("store the secret");
    assert!(
        !format!("{updated:?}").contains(SENTINEL),
        "the returned profile carries no credential"
    );
    let binding = updated
        .launch_spec
        .env
        .iter()
        .find(|binding| binding.key == "API_KEY")
        .expect("binding");
    assert_eq!(binding.value, "keychain:tethys/profile/audit/API_KEY");
    assert_eq!(
        secrets.get("profile/audit/API_KEY").expect("keychain"),
        Some(SENTINEL.to_string()),
        "the value lives in the keychain"
    );

    core.agent_login("audit".into(), "agent".into(), None)
        .await
        .expect("login");

    // The persisted rows carry only keychain refs, never the sentinel.
    let rows = store.agent_profiles().await.expect("rows");
    let persisted: String = rows
        .iter()
        .map(|row| {
            format!(
                "{} {} {} {} {} {} {}",
                row.id,
                row.name,
                row.class,
                row.launch_spec,
                row.registry_ref.clone().unwrap_or_default(),
                row.projection_target.clone().unwrap_or_default(),
                row.preferred_protocol.clone().unwrap_or_default(),
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    assert!(
        !persisted.contains(SENTINEL),
        "store must not contain a credential value"
    );
    for row in &rows {
        let spec: LaunchSpecInput = serde_json::from_str(&row.launch_spec).expect("spec");
        for env in &spec.env {
            assert!(
                !env.value.contains(SENTINEL),
                "provider env carries no credential value: {}",
                env.key
            );
            if env.key == "API_KEY" {
                assert!(
                    env.value.starts_with("keychain:tethys/"),
                    "credential env is a keychain ref, not a value: {}",
                    env.value
                );
            }
        }
    }

    // And no profile column is a secret column.
    let lower = persisted.to_lowercase();
    for banned in ["\"password\"", "\"token\"", "\"secret\"", "\"credential\""] {
        assert!(!lower.contains(banned), "no secret column: {banned}");
    }

    // A full thread round-trip emits no credential either.
    let thread = core
        .thread_create(CreateThread {
            workspace_id: "workspace".into(),
            agent_profile_id: "audit".into(),
            workdir: workdir("thread").display().to_string(),
            additional_directories: Vec::new(),
            isolation: None,
        })
        .await
        .expect("thread")
        .id;
    let mut events = core
        .events_subscribe(thread.clone(), 0)
        .await
        .expect("subscribe");
    core.thread_prompt(thread.clone(), vec![ContentBlock::Text("hello".into())])
        .await
        .expect("prompt");
    let mut transcript = String::new();
    for _ in 0..64 {
        match tokio::time::timeout(std::time::Duration::from_millis(200), events.next()).await {
            Ok(Some(event)) => transcript.push_str(&format!("{event:?}")),
            _ => break,
        }
    }
    assert!(
        !transcript.contains(SENTINEL) && !transcript.contains("keychain:"),
        "no event carries a credential"
    );
    let stderr = core.agent_stderr("audit".into()).await.expect("stderr");
    assert!(!stderr.contains(SENTINEL), "no log carries a credential");

    // The host method is strict about what it stores and for whom.
    for (key, value) in [("1BAD", "v"), ("A=B", "v"), ("API_KEY", "")] {
        assert!(
            matches!(
                core.agent_env_secret_set("audit".into(), key.into(), value.into())
                    .await,
                Err(ApiError::InvalidConfig(_))
            ),
            "{key:?}/{value:?} is refused"
        );
    }
    assert!(matches!(
        core.agent_env_secret_set("nobody".into(), "API_KEY".into(), "v".into())
            .await,
        Err(ApiError::NotFound(_))
    ));

    // A reference whose secret is gone must stop the launch and say why; it is
    // never handed to the agent as if it were the value.
    core.agent_profiles_create(ProfileInput {
        id: Some("orphan".into()),
        name: "Orphan".into(),
        launch_spec: LaunchSpecInput {
            program: std::env::current_exe()
                .expect("exe")
                .to_string_lossy()
                .to_string(),
            args: vec![],
            cwd: None,
            env: vec![
                EnvVarInput {
                    key: MOCK_ENV.into(),
                    value: "v1".into(),
                },
                EnvVarInput {
                    key: "API_KEY".into(),
                    value: "keychain:tethys/profile/orphan/API_KEY".into(),
                },
            ],
        },
        projection_target: None,
        preferred_protocol: Some(AcpProtocol::V1),
        enabled: true,
    })
    .await
    .expect("create orphan");
    core.agent_recheck(Some("orphan".into()))
        .await
        .expect("recheck");
    let orphan = core
        .agent_profiles_list()
        .await
        .expect("list")
        .into_iter()
        .find(|profile| profile.id == "orphan")
        .expect("orphan");
    assert_eq!(orphan.health, ProviderHealth::Error);
    let detail = orphan.detail.unwrap_or_default();
    assert!(detail.contains("missing from the keychain"), "{detail}");
    assert!(
        !detail.contains("keychain:tethys"),
        "the reference is not echoed"
    );

    // Deleting a profile deletes the secrets it owns, and only those.
    secrets.insert("shared/github", "not-the-profile's");
    core.agent_env_secret_set("audit".into(), "OTHER".into(), "x".into())
        .await
        .expect("second secret");
    core.agent_profiles_delete("audit".into())
        .await
        .expect("delete");
    assert_eq!(
        secrets.get("profile/audit/API_KEY").expect("keychain"),
        None
    );
    assert_eq!(secrets.get("profile/audit/OTHER").expect("keychain"), None);
    assert_eq!(
        secrets.get("shared/github").expect("keychain"),
        Some("not-the-profile's".to_string()),
        "a secret the profile does not own survives"
    );
}
