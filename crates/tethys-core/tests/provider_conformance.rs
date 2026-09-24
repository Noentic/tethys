//! Opt-in desktop-shaped conformance runner for a real ACP Registry provider.
//!
//! The deterministic mock suite remains the default gate. This test is ignored
//! because it needs a published registry, a provider binary, and an account.
//!
//! Every selected provider ends in exactly one disposition:
//! `exercised`, `declared-unsupported`, `not-observed`, or `setup-required`.
//! Output is one machine-readable line per run; raw ACP params, launch env
//! values, credentials, and provider stderr never reach it.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;

use futures::StreamExt;
use tethys_agent_servers::registry::HttpRegistrySource;
use tethys_api::{AgentApi, ApiError, EventsApi, ThreadApi, WorkspaceApi};
use tethys_core::{Core, CorePaths};
use tethys_schema::agents::{AgentProfileView, InstallResult};
use tethys_schema::catalog::{TrustGrant, TrustScope};
use tethys_schema::thread::{
    ContentBlock, CreateThread, ProviderControl, ProviderControlResult, SessionState, TurnEventBody,
};
use tethys_schema::workspace::PermissionMode;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Disposition {
    Exercised,
    DeclaredUnsupported,
    NotObserved,
    SetupRequired,
}

impl Disposition {
    fn as_str(self) -> &'static str {
        match self {
            Disposition::Exercised => "exercised",
            Disposition::DeclaredUnsupported => "declared-unsupported",
            Disposition::NotObserved => "not-observed",
            Disposition::SetupRequired => "setup-required",
        }
    }
}

/// One disposition line, sanitized: stage plus at most a short reason.
fn report(provider_id: &str, disposition: Disposition, stage: &str, reason: &str) {
    report_record(
        provider_id,
        disposition,
        stage,
        reason,
        serde_json::Value::Null,
    );
}

fn profile_snapshot(profile: Option<&AgentProfileView>, launch_source: &str) -> serde_json::Value {
    let auth_methods = profile
        .map(|profile| {
            profile
                .auth_methods
                .iter()
                .map(|method| {
                    serde_json::json!({
                        "id": method.id,
                        "name": method.name,
                        "shape": &method.shape,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    serde_json::json!({
        "launch_source": launch_source,
        "adapter_version": profile.and_then(|profile| profile.detected_version.as_deref()),
        "protocol": profile.and_then(|profile| profile.protocol),
        "health": profile.map(|profile| profile.health),
        "auth_state": profile.map(|profile| profile.auth_state),
        "auth_methods": auth_methods,
        "capabilities": profile.and_then(|profile| profile.capabilities.as_ref()),
    })
}

fn report_conformance_snapshot(
    provider_id: &str,
    disposition: Disposition,
    stage: &str,
    reason: &str,
    install: Option<&InstallResult>,
    profile: Option<&AgentProfileView>,
    launch_source: &str,
) {
    let mut snapshot = profile_snapshot(profile, launch_source);
    if let Some(install) = install {
        snapshot["registry_version"] = serde_json::json!(install.version);
        snapshot["distribution"] = serde_json::json!(install.distribution);
        snapshot["node_runtime_missing"] = serde_json::json!(install.needs_node);
    }
    report_record(provider_id, disposition, stage, reason, snapshot);
}

fn report_install_snapshot(
    provider_id: &str,
    disposition: Disposition,
    stage: &str,
    reason: &str,
    install: &InstallResult,
    profile: Option<&AgentProfileView>,
) {
    report_conformance_snapshot(
        provider_id,
        disposition,
        stage,
        reason,
        Some(install),
        profile,
        "registry",
    );
}

fn registry_install_allowed(
    adapter_path_supplied: bool,
    system_adapter_found: bool,
    install_opted_in: bool,
) -> bool {
    !adapter_path_supplied && !system_adapter_found && install_opted_in
}

fn validate_adapter_path(path: PathBuf) -> Result<PathBuf, &'static str> {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    if !matches!(
        name,
        "codex-acp" | "codex-acp.exe" | "opencode" | "opencode.exe"
    ) {
        return Err("TETHYS_CONFORMANCE_ACP_PATH must point to codex-acp or opencode");
    }
    let path = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .map_err(|_| "could not resolve the ACP adapter path")?
            .join(path)
    };
    if !path.is_file() {
        return Err("the configured ACP adapter path is not a file");
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if std::fs::metadata(&path)
            .map_err(|_| "could not inspect the ACP adapter file")?
            .permissions()
            .mode()
            & 0o111
            == 0
        {
            return Err("the configured ACP adapter file is not executable");
        }
    }
    Ok(path)
}

struct RestorePath(Option<std::ffi::OsString>);

impl Drop for RestorePath {
    fn drop(&mut self) {
        if let Some(path) = self.0.take() {
            std::env::set_var("PATH", path);
        } else {
            std::env::remove_var("PATH");
        }
    }
}

fn prepend_adapter_path(path: &Path) -> Result<RestorePath, std::io::Error> {
    let original = std::env::var_os("PATH");
    let mut paths = vec![path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf()];
    if let Some(original) = &original {
        paths.extend(std::env::split_paths(original));
    }
    let joined = std::env::join_paths(paths)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidInput, error))?;
    std::env::set_var("PATH", joined);
    Ok(RestorePath(original))
}

fn report_record(
    provider_id: &str,
    disposition: Disposition,
    stage: &str,
    reason: &str,
    snapshot: serde_json::Value,
) {
    let node_runtime = Command::new("node")
        .arg("--version")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string());
    println!(
        "provider-conformance: {}",
        serde_json::json!({
            "disposition": disposition.as_str(),
            "provider": provider_id,
            "stage": stage,
            "node_runtime": node_runtime.unwrap_or_else(|| "missing".into()),
            "reason": sanitize(reason),
            "snapshot": (snapshot != serde_json::Value::Null).then_some(snapshot),
        })
    );
}

fn report_feature(
    provider_id: &str,
    feature: &str,
    disposition: Disposition,
    reason: &str,
    evidence: serde_json::Value,
) {
    report_record(
        provider_id,
        disposition,
        feature,
        reason,
        serde_json::json!({ "evidence": evidence }),
    );
}

/// Strips query strings and truncates; never prints raw params or env values.
fn sanitize(message: &str) -> String {
    let scrubbed: String = message
        .split_whitespace()
        .map(|token| token.split('?').next().unwrap_or(token))
        .collect::<Vec<_>>()
        .join(" ");
    scrubbed.chars().take(160).collect()
}

fn classify_setup(reason: &str) -> Disposition {
    let lowered = reason.to_lowercase();
    if lowered.contains("unsupported") || lowered.contains("not supported") {
        Disposition::DeclaredUnsupported
    } else {
        Disposition::SetupRequired
    }
}

#[test]
fn registry_install_requires_opt_in_and_no_adapter_source() {
    assert!(!registry_install_allowed(true, false, true));
    assert!(!registry_install_allowed(false, true, true));
    assert!(!registry_install_allowed(false, false, false));
    assert!(registry_install_allowed(false, false, true));
}

#[test]
fn explicit_adapter_path_must_name_supported_provider() {
    assert_eq!(
        validate_adapter_path(PathBuf::from("/tmp/other-agent")),
        Err("TETHYS_CONFORMANCE_ACP_PATH must point to codex-acp or opencode")
    );
}

#[test]
fn explicit_adapter_path_accepts_a_local_executable_fixture() {
    let directory = tempfile::tempdir().expect("fixture directory");
    let name = if cfg!(windows) {
        "codex-acp.exe"
    } else {
        "codex-acp"
    };
    let adapter = directory.path().join(name);
    std::fs::write(&adapter, "fixture").expect("fixture adapter");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&adapter)
            .expect("adapter metadata")
            .permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&adapter, permissions).expect("executable fixture");
    }
    assert_eq!(validate_adapter_path(adapter.clone()), Ok(adapter));

    // Also verify opencode executable fixture is accepted
    let opencode_name = if cfg!(windows) {
        "opencode.exe"
    } else {
        "opencode"
    };
    let opencode_adapter = directory.path().join(opencode_name);
    std::fs::write(&opencode_adapter, "fixture").expect("fixture adapter");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&opencode_adapter)
            .expect("adapter metadata")
            .permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&opencode_adapter, permissions).expect("executable fixture");
    }
    assert_eq!(
        validate_adapter_path(opencode_adapter.clone()),
        Ok(opencode_adapter)
    );
}

#[tokio::test]
#[ignore = "requires a published ACP provider, runtime, and account"]
async fn run_selected_registry_provider() -> Result<(), Box<dyn std::error::Error>> {
    let Some(provider_id) = std::env::var_os("TETHYS_CONFORMANCE_PROVIDER_ID") else {
        report(
            "unselected",
            Disposition::SetupRequired,
            "env",
            "set TETHYS_CONFORMANCE_PROVIDER_ID",
        );
        return Ok(());
    };
    let provider_id = provider_id.to_string_lossy().into_owned();
    let Some(workspace) = std::env::var_os("TETHYS_CONFORMANCE_WORKSPACE") else {
        report(
            &provider_id,
            Disposition::SetupRequired,
            "env",
            "set TETHYS_CONFORMANCE_WORKSPACE",
        );
        return Ok(());
    };
    let workspace = PathBuf::from(workspace);
    if !workspace.is_dir() {
        report(
            &provider_id,
            Disposition::SetupRequired,
            "workspace",
            "workspace is not a directory",
        );
        return Ok(());
    }

    let adapter_path = match std::env::var_os("TETHYS_CONFORMANCE_ACP_PATH") {
        Some(path) => match validate_adapter_path(PathBuf::from(path)) {
            Ok(path) => Some(path),
            Err(reason) => {
                report(&provider_id, Disposition::SetupRequired, "adapter", reason);
                return Ok(());
            }
        },
        None => None,
    };
    if adapter_path.is_some() && provider_id != "codex-acp" && provider_id != "opencode" {
        report(
            &provider_id,
            Disposition::SetupRequired,
            "adapter",
            "TETHYS_CONFORMANCE_ACP_PATH currently selects the codex-acp or opencode adapter",
        );
        return Ok(());
    }

    let run_id = format!("run-{}", std::process::id());
    let home = std::env::var_os("TETHYS_CONFORMANCE_HOME")
        .map(|home| PathBuf::from(home).join(&run_id))
        .unwrap_or_else(|| {
            std::env::temp_dir().join(format!("tethys-provider-conformance-{run_id}"))
        });
    let core = Arc::new(
        Core::open(CorePaths::new(home))
            .await?
            .with_registry_source(Arc::new(HttpRegistrySource::published()?)),
    );
    let install_opted_in =
        std::env::var("TETHYS_CONFORMANCE_ALLOW_REGISTRY_INSTALL").as_deref() == Ok("1");
    let version = std::env::var("TETHYS_CONFORMANCE_VERSION").ok();

    let (profile, install, launch_source) = if let Some(path) = adapter_path.as_deref() {
        let _restore_path = prepend_adapter_path(path)?;
        match core.agent_registry_use_system(provider_id.clone()).await {
            Ok(profile) => (profile, None, "explicit-path"),
            Err(error) => {
                report_conformance_snapshot(
                    &provider_id,
                    classify_setup(&error.to_string()),
                    "adapter",
                    &error.to_string(),
                    None,
                    None,
                    "explicit-path",
                );
                return Ok(());
            }
        }
    } else {
        match core.agent_registry_use_system(provider_id.clone()).await {
            Ok(profile) => (profile, None, "system-path"),
            Err(ApiError::NotFound(reason)) if reason.starts_with("system ACP server ") => {
                if !registry_install_allowed(false, false, install_opted_in) {
                    report(
                        &provider_id,
                        Disposition::SetupRequired,
                        "adapter",
                        "no codex-acp adapter found; registry install requires TETHYS_CONFORMANCE_ALLOW_REGISTRY_INSTALL=1",
                    );
                    return Ok(());
                }
                let install = match core
                    .agent_registry_install(provider_id.clone(), version)
                    .await
                {
                    Ok(install) => install,
                    Err(error) => {
                        let message = error.to_string();
                        report(&provider_id, classify_setup(&message), "install", &message);
                        return Ok(());
                    }
                };
                let profile = core
                    .agent_profiles_list()
                    .await?
                    .into_iter()
                    .find(|profile| profile.id == install.profile_id);
                let Some(profile) = profile else {
                    report_install_snapshot(
                        &provider_id,
                        Disposition::NotObserved,
                        "profile",
                        "installed profile was not returned",
                        &install,
                        None,
                    );
                    return Ok(());
                };
                (profile, Some(install), "registry")
            }
            Err(error) => {
                report(
                    &provider_id,
                    Disposition::SetupRequired,
                    "adapter",
                    &error.to_string(),
                );
                return Ok(());
            }
        }
    };
    if profile.health != tethys_schema::agents::ProviderHealth::Healthy {
        if profile.auth_state == tethys_schema::agents::AuthState::Required {
            report_conformance_snapshot(
                &provider_id,
                Disposition::SetupRequired,
                "auth",
                "provider authentication is required",
                install.as_ref(),
                Some(&profile),
                launch_source,
            );
        } else {
            report_conformance_snapshot(
                &provider_id,
                Disposition::NotObserved,
                "initialize",
                profile
                    .detail
                    .as_deref()
                    .unwrap_or("provider did not reach healthy state"),
                install.as_ref(),
                Some(&profile),
                launch_source,
            );
        }
        return Ok(());
    }

    let workspace_item = match core
        .workspace_add(TrustGrant {
            path: workspace.display().to_string(),
            permission_mode: PermissionMode::Supervised,
            scope: TrustScope::Folder,
            init_git: false,
        })
        .await
    {
        Ok(workspace) => workspace,
        Err(error) => {
            report_conformance_snapshot(
                &provider_id,
                Disposition::NotObserved,
                "workspace",
                &error.to_string(),
                install.as_ref(),
                Some(&profile),
                launch_source,
            );
            return Ok(());
        }
    };
    let bootstrap = match core
        .thread_prepare(CreateThread {
            workspace_id: workspace_item.id.to_string(),
            agent_profile_id: profile.id.clone(),
            workdir: workspace.display().to_string(),
            additional_directories: Vec::new(),
            isolation: None,
        })
        .await
    {
        Ok(bootstrap) => bootstrap,
        Err(error) => {
            report_conformance_snapshot(
                &provider_id,
                classify_setup(&error.to_string()),
                "prepare",
                &error.to_string(),
                install.as_ref(),
                Some(&profile),
                launch_source,
            );
            return Ok(());
        }
    };
    let thread_id = bootstrap.thread.id.clone();
    let capabilities = bootstrap.capabilities.as_ref();
    if capabilities.is_some_and(|caps| caps.provider_extensions.provider_routing) {
        match core
            .thread_provider_control(thread_id.clone(), ProviderControl::ListProviders)
            .await
        {
            Ok(ProviderControlResult::Providers { providers }) => report_feature(
                &provider_id,
                "provider-routing-list",
                Disposition::Exercised,
                "read-only route list succeeded; route ids, URLs, and headers omitted",
                serde_json::json!({
                    "routes": providers.len(),
                    "required_routes": providers.iter().filter(|route| route.required).count(),
                }),
            ),
            Ok(_) => report_feature(
                &provider_id,
                "provider-routing-list",
                Disposition::NotObserved,
                "provider list returned an unexpected result",
                serde_json::Value::Null,
            ),
            Err(error) => report_feature(
                &provider_id,
                "provider-routing-list",
                Disposition::NotObserved,
                &error.to_string(),
                serde_json::Value::Null,
            ),
        }
    } else {
        report_feature(
            &provider_id,
            "provider-routing-list",
            Disposition::DeclaredUnsupported,
            "provider routing was not negotiated",
            serde_json::Value::Null,
        );
    }
    let mut events = match core
        .events_subscribe(thread_id.clone(), bootstrap.latest_seq)
        .await
    {
        Ok(events) => events,
        Err(error) => {
            let reason = core
                .thread_delete(thread_id)
                .await
                .err()
                .map(|cleanup| format!("{error}; thread cleanup failed: {cleanup}"))
                .unwrap_or_else(|| error.to_string());
            report_conformance_snapshot(
                &provider_id,
                Disposition::NotObserved,
                "subscribe",
                &reason,
                install.as_ref(),
                Some(&profile),
                launch_source,
            );
            return Ok(());
        }
    };
    let prompt_core = Arc::clone(&core);
    let prompt_thread = thread_id.clone();
    let mut prompt_task = tokio::spawn(async move {
        prompt_core
            .thread_prompt(
                prompt_thread,
                vec![ContentBlock::Text("tethys conformance".into())],
            )
            .await
    });

    let mut last_seq = bootstrap.latest_seq;
    let mut saw_message = false;
    let mut saw_idle = false;
    let mut prompt_finished = false;
    let mut failure = None;
    let event_deadline = tokio::time::Instant::now() + Duration::from_secs(90);
    loop {
        let next = tokio::select! {
            result = &mut prompt_task, if !prompt_finished => {
                prompt_finished = true;
                match result {
                    Ok(Ok(())) => continue,
                    Ok(Err(error)) => {
                        failure = Some((
                            classify_setup(&error.to_string()),
                            "prompt",
                            error.to_string(),
                        ));
                        break;
                    }
                    Err(error) => {
                        failure = Some((
                            Disposition::NotObserved,
                            "prompt",
                            error.to_string(),
                        ));
                        break;
                    }
                }
            }
            next = tokio::time::timeout_at(event_deadline, events.next()) => next,
        };
        let next = match next {
            Ok(next) => next,
            Err(_) => {
                failure = Some((
                    Disposition::NotObserved,
                    "events",
                    "timed out waiting for turn events".to_string(),
                ));
                break;
            }
        };
        let Some(event) = next else {
            failure.get_or_insert_with(|| {
                (
                    Disposition::NotObserved,
                    "events",
                    "event stream ended before the turn completed".to_string(),
                )
            });
            break;
        };
        if event.seq <= last_seq {
            failure = Some((
                Disposition::NotObserved,
                "events",
                "event sequence did not advance".to_string(),
            ));
            break;
        }
        last_seq = event.seq;
        match event.event {
            TurnEventBody::MessageChunk(_) | TurnEventBody::MessageUpsert(_) => {
                saw_message = true;
            }
            TurnEventBody::StateChanged(changed)
                if saw_message && matches!(changed.state, SessionState::Idle { .. }) =>
            {
                saw_idle = true;
                break;
            }
            _ => {}
        }
    }

    if failure.is_some() || !saw_idle {
        if let Err(error) = core.thread_cancel(thread_id.clone()).await {
            failure.get_or_insert_with(|| (Disposition::NotObserved, "cancel", error.to_string()));
        }
    }

    if !prompt_finished {
        match tokio::time::timeout(Duration::from_secs(10), &mut prompt_task).await {
            Ok(Ok(Ok(()))) => {}
            Ok(Ok(Err(error))) => {
                failure.get_or_insert_with(|| {
                    (
                        classify_setup(&error.to_string()),
                        "prompt",
                        error.to_string(),
                    )
                });
            }
            Ok(Err(error)) => {
                failure
                    .get_or_insert_with(|| (Disposition::NotObserved, "prompt", error.to_string()));
            }
            Err(_) => {
                if failure.is_none() {
                    let _ = core.thread_cancel(thread_id.clone()).await;
                }
                prompt_task.abort();
                let _ = prompt_task.await;
                failure.get_or_insert_with(|| {
                    (
                        Disposition::NotObserved,
                        "prompt",
                        "prompt did not finish after cancellation".to_string(),
                    )
                });
            }
        }
    }

    if !saw_idle {
        failure.get_or_insert_with(|| {
            (
                Disposition::NotObserved,
                "turn",
                "turn did not reach idle after a message".to_string(),
            )
        });
    }
    if failure.is_none() {
        if capabilities.is_some_and(|caps| caps.session_fork) {
            match core.thread_fork(thread_id.clone()).await {
                Ok(fork) if fork.thread.id != thread_id => {
                    let fork_id = fork.thread.id;
                    match core.thread_delete(fork_id).await {
                        Ok(()) => report_feature(
                            &provider_id,
                            "session-fork",
                            Disposition::Exercised,
                            "provider fork created a distinct Tethys thread and cleanup succeeded",
                            serde_json::json!({ "distinct_thread": true, "cleaned_up": true }),
                        ),
                        Err(error) => {
                            let reason = format!("fork cleanup failed: {error}");
                            report_feature(
                                &provider_id,
                                "session-fork",
                                Disposition::NotObserved,
                                &reason,
                                serde_json::json!({ "distinct_thread": true, "cleaned_up": false }),
                            );
                            failure.get_or_insert((
                                Disposition::NotObserved,
                                "fork_cleanup",
                                reason,
                            ));
                        }
                    }
                }
                Ok(_) => report_feature(
                    &provider_id,
                    "session-fork",
                    Disposition::NotObserved,
                    "provider fork did not create a distinct Tethys thread",
                    serde_json::Value::Null,
                ),
                Err(error) => report_feature(
                    &provider_id,
                    "session-fork",
                    Disposition::NotObserved,
                    &error.to_string(),
                    serde_json::Value::Null,
                ),
            }
        } else {
            report_feature(
                &provider_id,
                "session-fork",
                Disposition::DeclaredUnsupported,
                "session fork was not negotiated",
                serde_json::Value::Null,
            );
        }
    }
    if let Err(error) = core.thread_delete(thread_id).await {
        let delete_error = format!("thread deletion failed: {error}");
        if let Some((_, _, reason)) = failure.as_mut() {
            reason.push_str("; ");
            reason.push_str(&delete_error);
        } else {
            failure = Some((Disposition::NotObserved, "delete", delete_error));
        }
    }
    if let Some((disposition, stage, reason)) = failure {
        report_conformance_snapshot(
            &provider_id,
            disposition,
            stage,
            &reason,
            install.as_ref(),
            Some(&profile),
            launch_source,
        );
        return Ok(());
    }
    report_conformance_snapshot(
        &provider_id,
        Disposition::Exercised,
        "vertical",
        "install→prepare→prompt→idle→delete",
        install.as_ref(),
        Some(&profile),
        launch_source,
    );
    Ok(())
}
