//! Agent profile store + registry API tests (M1.12 U1/U6).

use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use tethys_agent_servers::registry::{Registry, RegistryError, RegistrySource};
use tethys_api::AgentApi;
use tethys_core::health::DEFAULT_INTERVAL_SECS;
use tethys_core::Core;
use tethys_core::CorePaths;
use tethys_schema::agents::{EnvVarInput, LaunchSpecInput, ProfileInput};
use tethys_schema::connection::AcpProtocol;
use tethys_schema::sync::ProjectionTarget;

/// A registry source whose document can be swapped to simulate a release.
struct FixtureSource(Arc<Mutex<Registry>>);

impl FixtureSource {
    fn new(version: &str) -> Self {
        Self::for_entry(
            "claude-acp",
            "Claude Agent",
            version,
            &format!("@agentclientprotocol/claude-agent-acp@{version}"),
        )
    }

    fn for_entry(id: &str, name: &str, version: &str, package: &str) -> Self {
        let registry: Registry = serde_json::from_value(serde_json::json!({
            "version": "1.0.0",
            "agents": [{
                "id": id,
                "name": name,
                "version": version,
                "description": "ACP wrapper",
                "license": "proprietary",
                "distribution": { "npx": { "package": package } },
            }],
            "extensions": [],
        }))
        .expect("registry");
        Self(Arc::new(Mutex::new(registry)))
    }

    fn set_version(&self, version: &str) {
        let mut registry = self.0.lock().expect("lock");
        registry.agents[0].version = version.to_string();
        let npx = registry.agents[0]
            .distribution
            .npx
            .as_mut()
            .expect("fixture is npx");
        npx.package = format!("@agentclientprotocol/claude-agent-acp@{version}");
    }
}

#[async_trait]
impl RegistrySource for FixtureSource {
    async fn fetch(&self) -> Result<Registry, RegistryError> {
        Ok(self.0.lock().expect("lock").clone())
    }
}

fn profile_input(name: &str, program: &str) -> ProfileInput {
    ProfileInput {
        id: None,
        name: name.to_string(),
        launch_spec: LaunchSpecInput {
            program: program.to_string(),
            args: vec!["acp".into()],
            cwd: None,
            env: vec![],
        },
        projection_target: None,
        preferred_protocol: Some(AcpProtocol::V1),
        enabled: true,
    }
}

/// Replaces `PATH` for the life of the guard. Installing an `npx` entry
/// re-checks the Provider, which would otherwise run a real `npx -y <package>`
/// (network access and vendor code) from a unit test.
struct PathGuard(Option<std::ffi::OsString>);

impl PathGuard {
    fn replace(with: &std::path::Path) -> Self {
        let previous = std::env::var_os("PATH");
        std::env::set_var("PATH", with);
        Self(previous)
    }
}

impl Drop for PathGuard {
    fn drop(&mut self) {
        match self.0.take() {
            Some(path) => std::env::set_var("PATH", path),
            None => std::env::remove_var("PATH"),
        }
    }
}

async fn open_core(dir: &std::path::Path, source: Arc<FixtureSource>) -> Core {
    Core::open(CorePaths::new(dir))
        .await
        .expect("open")
        .with_registry_source(source)
}

#[tokio::test]
async fn profiles_round_trip_and_hydrate_across_reopen() {
    let dir = tempfile::tempdir().expect("tempdir");
    let source = Arc::new(FixtureSource::new("0.79.0"));
    {
        let core = open_core(dir.path(), source.clone()).await;
        let created = core
            .agent_profiles_create(profile_input("My Agent", "my-agent"))
            .await
            .expect("create");
        assert_eq!(created.name, "My Agent");
        assert!(created.enabled);
        let listed = core.agent_profiles_list().await.expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].launch_spec.program, "my-agent");
    }

    // Reopen: hydration surfaces the same profile.
    let reopened = open_core(dir.path(), source).await;
    let listed = reopened.agent_profiles_list().await.expect("list");
    assert_eq!(listed.len(), 1, "profile persisted across restart");
    assert_eq!(listed[0].launch_spec.program, "my-agent");
    assert!(
        reopened.sessions().connection_key(&listed[0].id).is_some(),
        "hydrated into the hot cache"
    );
}

#[tokio::test]
async fn registry_install_pins_and_an_upstream_release_does_not_mutate_it() {
    let dir = tempfile::tempdir().expect("tempdir");
    let empty_path = tempfile::tempdir().expect("empty PATH dir");
    let _path = PathGuard::replace(empty_path.path());
    let source = Arc::new(FixtureSource::new("0.79.0"));
    let core = open_core(dir.path(), source.clone()).await;

    let installed = core
        .agent_registry_install("claude-acp".into(), None)
        .await
        .expect("install");
    assert_eq!(installed.version, "0.79.0");
    assert_eq!(installed.launch_spec.program, "npx");
    assert_eq!(
        installed.launch_spec.args[1],
        "@agentclientprotocol/claude-agent-acp@0.79.0"
    );

    // With no `npx` on PATH the install is healthy-to-persist but not runnable.
    let profiles = core.agent_profiles_list().await.expect("profiles");
    let profile = profiles
        .iter()
        .find(|p| p.id == "claude-acp")
        .expect("profile");
    assert_eq!(
        profile.health,
        tethys_schema::agents::ProviderHealth::NotFound
    );
    assert!(
        profile
            .detail
            .as_deref()
            .is_some_and(|d| d.contains("Node.js")),
        "reads needs Node.js, not a generic launch failure: {:?}",
        profile.detail
    );

    let listed = core.agent_registry_list().await.expect("registry list");
    let entry = listed.iter().find(|e| e.id == "claude-acp").expect("entry");
    assert!(entry.installed);
    assert_eq!(entry.pinned_version.as_deref(), Some("0.79.0"));
    assert_eq!(entry.compliance_note, None);

    // Upstream moves on; the pin is untouched and the update is opt-in.
    source.set_version("0.80.0");
    let listed = core.agent_registry_list().await.expect("registry list");
    let entry = listed.iter().find(|e| e.id == "claude-acp").expect("entry");
    assert_eq!(entry.pinned_version.as_deref(), Some("0.79.0"));
    assert_eq!(
        entry.update,
        Some(tethys_schema::agents::UpdateAvailability::Available {
            latest: "0.80.0".into()
        })
    );

    let mut profile = core
        .agent_profiles_list()
        .await
        .expect("profiles")
        .into_iter()
        .find(|profile| profile.id == installed.profile_id)
        .expect("installed profile");
    profile.name = "My Claude setup".into();
    profile.launch_spec.cwd = Some("/workspace".into());
    profile.launch_spec.env = vec![EnvVarInput {
        key: "CLAUDE_CONFIG_DIR".into(),
        value: "/private/claude".into(),
    }];
    profile.projection_target = Some(ProjectionTarget::ClaudeCode);
    profile.preferred_protocol = Some(AcpProtocol::V2);
    profile.enabled = false;
    core.agent_profiles_update(ProfileInput {
        id: Some(profile.id.clone()),
        name: profile.name,
        launch_spec: profile.launch_spec,
        projection_target: profile.projection_target,
        preferred_protocol: profile.preferred_protocol,
        enabled: profile.enabled,
    })
    .await
    .expect("customize installed profile");

    let updated = core
        .agent_registry_update("claude-acp".into())
        .await
        .expect("update");
    assert_eq!(updated.version, "0.80.0");
    assert_eq!(
        updated.launch_spec.args[1],
        "@agentclientprotocol/claude-agent-acp@0.80.0"
    );
    let profile = core
        .agent_profiles_list()
        .await
        .expect("profiles")
        .into_iter()
        .find(|profile| profile.id == installed.profile_id)
        .expect("updated profile");
    assert_eq!(profile.name, "My Claude setup");
    assert_eq!(profile.launch_spec.cwd.as_deref(), Some("/workspace"));
    assert_eq!(profile.launch_spec.env[0].key, "CLAUDE_CONFIG_DIR");
    assert_eq!(profile.launch_spec.env[0].value, "/private/claude");
    assert_eq!(
        profile.projection_target,
        Some(ProjectionTarget::ClaudeCode)
    );
    assert_eq!(profile.preferred_protocol, Some(AcpProtocol::V2));
    assert!(!profile.enabled);
    assert_eq!(profile.registry_ref.as_ref().unwrap().version, "0.80.0");
}

#[tokio::test]
async fn registry_update_requires_a_registry_owned_profile() {
    let dir = tempfile::tempdir().expect("tempdir");
    let source = Arc::new(FixtureSource::new("0.79.0"));
    let core = open_core(dir.path(), source).await;
    let mut input = profile_input("My Claude", "claude");
    input.id = Some("claude-acp".into());
    core.agent_profiles_create(input)
        .await
        .expect("manual profile");

    let error = core
        .agent_registry_update("claude-acp".into())
        .await
        .expect_err("manual profiles do not own registry updates");
    assert!(matches!(error, tethys_api::ApiError::NotFound(_)));
}

#[tokio::test]
async fn compliance_gated_registry_entries_cannot_be_installed() {
    let dir = tempfile::tempdir().expect("tempdir");
    let source = Arc::new(FixtureSource::for_entry(
        "antigravity-acp",
        "Antigravity ACP",
        "1.0.0",
        "antigravity-acp@1.0.0",
    ));
    let core = open_core(dir.path(), source).await;

    let error = core
        .agent_registry_install("antigravity-acp".into(), None)
        .await
        .expect_err("compliance gate");
    assert!(matches!(error, tethys_api::ApiError::Failure { .. }));
    assert!(error.to_string().contains("compliance review"));
    assert!(core
        .agent_profiles_list()
        .await
        .expect("profiles")
        .is_empty());
}

#[tokio::test]
async fn manual_profile_update_and_delete_are_typed() {
    let dir = tempfile::tempdir().expect("tempdir");
    let source = Arc::new(FixtureSource::new("0.79.0"));
    let core = open_core(dir.path(), source).await;

    let created = core
        .agent_profiles_create(profile_input("Agent", "definitely-not-a-real-binary-xyz"))
        .await
        .expect("create");
    let mut update = profile_input("Agent Renamed", "definitely-not-a-real-binary-xyz");
    update.id = Some(created.id.clone());
    update.projection_target = None;
    let updated = core.agent_profiles_update(update).await.expect("update");
    assert_eq!(updated.name, "Agent Renamed");

    core.agent_profiles_delete(created.id.clone())
        .await
        .expect("delete");
    assert!(core.agent_profiles_list().await.expect("list").is_empty());

    // A duplicate manual id is a typed conflict, not a panic.
    let mut duplicate = profile_input("Agent", "my-agent");
    duplicate.id = Some("dup".into());
    core.agent_profiles_create(duplicate.clone())
        .await
        .expect("first");
    let error = core
        .agent_profiles_create(duplicate)
        .await
        .expect_err("duplicate");
    assert!(matches!(error, tethys_api::ApiError::Conflict(_)));
}

#[tokio::test]
async fn opening_core_arms_the_poller_and_checks_only_enabled_providers() {
    let dir = tempfile::tempdir().expect("tempdir");
    let source = Arc::new(FixtureSource::new("0.79.0"));
    let (on, off) = {
        let core = open_core(dir.path(), source.clone()).await;
        let on = core
            .agent_profiles_create(profile_input("On Agent", "on-agent"))
            .await
            .expect("create")
            .id;
        let off = core
            .agent_profiles_create(profile_input("Off Agent", "off-agent"))
            .await
            .expect("create")
            .id;
        core.agent_profiles_update(ProfileInput {
            id: Some(off.clone()),
            enabled: false,
            ..profile_input("Off Agent", "off-agent")
        })
        .await
        .expect("switch off");
        (on, off)
    };

    // A relaunch is a cold start: the poller is armed at the default interval
    // and one check of every *enabled* Provider runs without anyone asking.
    let reopened = open_core(dir.path(), source).await;
    let health = reopened.sessions().health();
    assert_eq!(health.interval_secs(), DEFAULT_INTERVAL_SECS);
    assert!(health.is_scheduled());

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    while health.record(&on).last_checked_ms.is_none() {
        assert!(
            std::time::Instant::now() < deadline,
            "cold start never checked the enabled Provider"
        );
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }

    // A manual sweep is the same set: the switched-off Provider is never spawned.
    reopened.agent_recheck(None).await.expect("recheck all");
    assert!(
        health.record(&off).last_checked_ms.is_none(),
        "a disabled Provider must not be checked by a sweep"
    );
}

#[tokio::test]
async fn editing_the_executable_or_switching_on_re_checks_that_provider() {
    let dir = tempfile::tempdir().expect("tempdir");
    let core = open_core(dir.path(), Arc::new(FixtureSource::new("0.79.0"))).await;
    let id = core
        .agent_profiles_create(profile_input("Agent", "first-missing-binary"))
        .await
        .expect("create")
        .id;
    let detail = |view: tethys_schema::agents::AgentProfileView| view.detail.unwrap_or_default();

    // The not-found detail names the program, so a re-check is observable.
    let mut edit = profile_input("Agent", "second-missing-binary");
    edit.id = Some(id.clone());
    let edited = core.agent_profiles_update(edit).await.expect("edit path");
    assert!(
        detail(edited).contains("second-missing-binary"),
        "path edit"
    );

    // Off, then on again: switching on re-checks with the current spec.
    let mut off = profile_input("Agent", "third-missing-binary");
    off.id = Some(id.clone());
    off.enabled = false;
    core.agent_profiles_update(off).await.expect("switch off");
    let mut on = profile_input("Agent", "third-missing-binary");
    on.id = Some(id);
    let switched = core.agent_profiles_update(on).await.expect("switch on");
    assert!(
        detail(switched).contains("third-missing-binary"),
        "toggle on"
    );
}
