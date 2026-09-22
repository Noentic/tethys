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
use std::sync::Arc;
use std::time::Duration;

use futures::StreamExt;
use tethys_agent_servers::registry::HttpRegistrySource;
use tethys_api::{AgentApi, EventsApi, ThreadApi, WorkspaceApi};
use tethys_core::{Core, CorePaths};
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
    println!(
        "provider-conformance: disposition={} provider={} stage={} reason={}",
        disposition.as_str(),
        provider_id,
        stage,
        sanitize(reason)
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
        report(
            &provider_id,
            classify_setup(&error.to_string()),
            "initialize",
            &error.to_string(),
        );
        return Ok(());
    }
    let profile = core
        .agent_profiles_list()
        .await?
        .into_iter()
        .find(|profile| profile.id == install.profile_id);
    let Some(profile) = profile else {
        report(
            &provider_id,
            Disposition::NotObserved,
            "profile",
            "installed profile was not returned",
        );
        return Ok(());
    };
    if profile.health != tethys_schema::agents::ProviderHealth::Healthy {
        if profile.auth_state == tethys_schema::agents::AuthState::Required {
            report(
                &provider_id,
                Disposition::SetupRequired,
                "auth",
                "provider authentication is required",
            );
        } else {
            report(
                &provider_id,
                Disposition::NotObserved,
                "initialize",
                &profile
                    .detail
                    .unwrap_or_else(|| "provider did not reach healthy state".into()),
            );
        }
        return Ok(());
    }

    let workspace_item = core
        .workspace_add(TrustGrant {
            path: workspace.display().to_string(),
            permission_mode: PermissionMode::Supervised,
            scope: TrustScope::Folder,
            init_git: false,
        })
        .await?;
    let bootstrap = core
        .thread_prepare(CreateThread {
            workspace_id: workspace_item.id.to_string(),
            agent_profile_id: install.profile_id,
            workdir: workspace.display().to_string(),
            additional_directories: Vec::new(),
        })
        .await?;
    let thread_id = bootstrap.thread.id.clone();
    let mut events = core
        .events_subscribe(thread_id.clone(), bootstrap.latest_seq)
        .await?;
    let prompt_core = Arc::clone(&core);
    let prompt_thread = thread_id.clone();
    let prompt_task = tokio::spawn(async move {
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
    loop {
        let next = tokio::time::timeout(Duration::from_secs(90), events.next()).await?;
        let Some(event) = next else { break };
        if event.seq <= last_seq {
            report(
                &provider_id,
                Disposition::NotObserved,
                "events",
                "event sequence did not advance",
            );
            return Ok(());
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
    prompt_task.await??;
    if !saw_idle {
        report(
            &provider_id,
            Disposition::NotObserved,
            "turn",
            "turn did not reach idle after a message",
        );
        return Ok(());
    }
    core.thread_delete(thread_id).await?;
    report(
        &provider_id,
        Disposition::Exercised,
        "vertical",
        "install→prepare→prompt→idle→delete",
    );
    Ok(())
}
