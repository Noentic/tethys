//! Opt-in desktop-shaped conformance runner for a real ACP Registry provider.
//!
//! The deterministic mock suite remains the default gate. This test is ignored
//! because it needs a published registry, a provider binary, and an account.
//!
//! Every selected provider ends in exactly one disposition:
//! `exercised`, `declared-unsupported`, `not-observed`, or `setup-required`.
//! Output is one machine-readable line per run; raw ACP params, launch env
//! values, credentials, and provider stderr never reach it.

use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;

use futures::StreamExt;
use tethys_agent_servers::registry::HttpRegistrySource;
use tethys_api::{AgentApi, EventsApi, ThreadApi, WorkspaceApi};
use tethys_core::{Core, CorePaths};
use tethys_schema::agents::{AgentProfileView, InstallResult};
use tethys_schema::catalog::{TrustGrant, TrustScope};
use tethys_schema::thread::{ContentBlock, CreateThread, SessionState, TurnEventBody};
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

fn report_install_snapshot(
    provider_id: &str,
    disposition: Disposition,
    stage: &str,
    reason: &str,
    install: &InstallResult,
    profile: Option<&AgentProfileView>,
) {
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
    let snapshot = serde_json::json!({
        "registry_version": install.version,
        "distribution": install.distribution,
        "node_runtime_missing": install.needs_node,
        "adapter_version": profile.and_then(|profile| profile.detected_version.as_deref()),
        "protocol": profile.and_then(|profile| profile.protocol),
        "health": profile.map(|profile| profile.health),
        "auth_state": profile.map(|profile| profile.auth_state),
        "auth_methods": auth_methods,
        "capabilities": profile.and_then(|profile| profile.capabilities.as_ref()),
    });
    report_record(provider_id, disposition, stage, reason, snapshot);
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

    let home = std::env::var_os("TETHYS_CONFORMANCE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("tethys-provider-conformance"));
    let core = Arc::new(
        Core::open(CorePaths::new(home))
            .await?
            .with_registry_source(Arc::new(HttpRegistrySource::published()?)),
    );

    let install = match core
        .agent_registry_install(
            provider_id.clone(),
            std::env::var("TETHYS_CONFORMANCE_VERSION").ok(),
        )
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let message = error.to_string();
            report(&provider_id, classify_setup(&message), "install", &message);
            return Ok(());
        }
    };
    if let Err(error) = core.agent_recheck(Some(install.profile_id.clone())).await {
        report_install_snapshot(
            &provider_id,
            classify_setup(&error.to_string()),
            "initialize",
            &error.to_string(),
            &install,
            None,
        );
        return Ok(());
    }
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
    if profile.health != tethys_schema::agents::ProviderHealth::Healthy {
        if profile.auth_state == tethys_schema::agents::AuthState::Required {
            report_install_snapshot(
                &provider_id,
                Disposition::SetupRequired,
                "auth",
                "provider authentication is required",
                &install,
                Some(&profile),
            );
        } else {
            report_install_snapshot(
                &provider_id,
                Disposition::NotObserved,
                "initialize",
                &profile
                    .detail
                    .as_deref()
                    .unwrap_or("provider did not reach healthy state"),
                &install,
                Some(&profile),
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
            report_install_snapshot(
                &provider_id,
                Disposition::NotObserved,
                "workspace",
                &error.to_string(),
                &install,
                Some(&profile),
            );
            return Ok(());
        }
    };
    let bootstrap = match core
        .thread_prepare(CreateThread {
            workspace_id: workspace_item.id.to_string(),
            agent_profile_id: install.profile_id.clone(),
            workdir: workspace.display().to_string(),
            additional_directories: Vec::new(),
        })
        .await
    {
        Ok(bootstrap) => bootstrap,
        Err(error) => {
            report_install_snapshot(
                &provider_id,
                classify_setup(&error.to_string()),
                "prepare",
                &error.to_string(),
                &install,
                Some(&profile),
            );
            return Ok(());
        }
    };
    let thread_id = bootstrap.thread.id.clone();
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
            report_install_snapshot(
                &provider_id,
                Disposition::NotObserved,
                "subscribe",
                &reason,
                &install,
                Some(&profile),
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
        report_install_snapshot(
            &provider_id,
            disposition,
            stage,
            &reason,
            &install,
            Some(&profile),
        );
        return Ok(());
    }
    report_install_snapshot(
        &provider_id,
        Disposition::Exercised,
        "vertical",
        "install→prepare→prompt→idle→delete",
        &install,
        Some(&profile),
    );
    Ok(())
}
