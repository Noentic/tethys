//! End-to-end thread flows over real mock-agent processes (harness = false so
//! the binary can re-exec itself as the mock vendor).

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures::stream::StreamExt;
use tethys_agent_servers::{ConnectionStore, LaunchSpec, StoreOptions};
use tethys_api::{AgentApi, EventsApi, ThreadApi};
use tethys_core::permission::DenyPermissionResolver;
use tethys_core::thread_session::ThreadSessions;
use tethys_core::Core;
use tethys_schema::connection::{AcpProtocol, AgentCompat, ConnectionKey};
use tethys_schema::thread::{
    ContentBlock, CreateThread, Entry, ThreadId, ThreadState, TurnEventBody,
};

const PROFILE_V1: &str = "mock-v1";
const PROFILE_AUTH: &str = "mock-v1-auth";
const PROFILE_NO_LOAD: &str = "mock-v1-no-load";
#[cfg(feature = "acp-v2")]
const PROFILE_V2: &str = "mock-v2";

fn main() {
    if tethys_acp::mock::run_if_requested() {
        return;
    }
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("runtime");
    runtime.block_on(async {
        prompt_streams_entries_and_backlog().await;
        kill_mid_turn_marks_interrupted_and_resume_keeps_history().await;
        reconnect_without_load_starts_fresh_session_once().await;
        four_threads_across_two_workdirs_stay_isolated().await;
        mode_and_config_changes_dispatch_and_cache().await;
        auth_required_session_updates_profile_auth_state().await;
        additional_directories_reach_the_session_and_stay_jailed().await;
        provider_sessions_paginate_with_a_cursor().await;
    });
    println!("thread_flows tests passed");
}

fn workdir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("tethys-thread-flows-{name}"));
    std::fs::create_dir_all(&dir).expect("workdir");
    dir
}

/// Makes the workspace root a git repository so the concurrency guard admits
/// more than one session (a non-git folder is capped at one).
fn init_git(dir: &Path) {
    let output = std::process::Command::new("git")
        .args(["init", "-q", "-b", "main"])
        .current_dir(dir)
        .output()
        .expect("git init");
    assert!(output.status.success(), "git init failed");
}

fn build_sessions(grace: Duration) -> Arc<ThreadSessions> {
    let options = StoreOptions {
        idle_grace: grace,
        cancel_grace: Duration::from_millis(200),
        ..StoreOptions::new(AcpProtocol::V1, Arc::new(DenyPermissionResolver))
    };
    let workspace_root = workdir("workspace");
    init_git(&workspace_root);
    let extra_root = workdir("extra");
    let roots = Arc::new(
        tethys_core::workspace_roots::StaticWorkspaces::new()
            .with("workspace", workspace_root)
            .with("extra", extra_root),
    );
    let sessions = Arc::new(ThreadSessions::new(
        ConnectionStore::new(options),
        tethys_core::thread_session::SyncSource::new(
            workdir("sync-home"),
            Arc::new(tethys_sync::MemorySecrets::new()),
        ),
        roots,
    ));
    sessions.register_profile(
        LaunchSpec::new(
            PROFILE_V1,
            std::env::current_exe()
                .expect("current exe")
                .to_string_lossy()
                .to_string(),
        )
        .env(tethys_acp::mock::MOCK_ENV, "v1"),
        AgentCompat {
            preferred_protocol: Some(AcpProtocol::V1),
            ..Default::default()
        },
    );
    sessions.register_profile(
        LaunchSpec::new(
            PROFILE_AUTH,
            std::env::current_exe()
                .expect("current exe")
                .to_string_lossy()
                .to_string(),
        )
        .env(tethys_acp::mock::MOCK_ENV, "v1")
        .env("TETHYS_MOCK_REQUIRE_AUTH", "new"),
        AgentCompat {
            preferred_protocol: Some(AcpProtocol::V1),
            ..Default::default()
        },
    );
    sessions.register_profile(
        LaunchSpec::new(
            PROFILE_NO_LOAD,
            std::env::current_exe()
                .expect("current exe")
                .to_string_lossy()
                .to_string(),
        )
        .env(tethys_acp::mock::MOCK_ENV, "v1")
        .env("TETHYS_MOCK_NO_LOAD", "1"),
        AgentCompat {
            preferred_protocol: Some(AcpProtocol::V1),
            ..Default::default()
        },
    );
    #[cfg(feature = "acp-v2")]
    sessions.register_profile(
        LaunchSpec::new(
            PROFILE_V2,
            std::env::current_exe()
                .expect("current exe")
                .to_string_lossy()
                .to_string(),
        )
        .env(tethys_acp::mock::MOCK_ENV, "v2"),
        AgentCompat {
            preferred_protocol: Some(AcpProtocol::V2),
            ..Default::default()
        },
    );
    sessions
}

fn build_core(grace: Duration) -> Core {
    Core::with_sessions("test", build_sessions(grace))
}

async fn create(core: &Core, profile: &str, name: &str) -> ThreadId {
    core.thread_create(CreateThread {
        workspace_id: "workspace".into(),
        agent_profile_id: profile.into(),
        workdir: workdir(name).display().to_string(),
        additional_directories: Vec::new(),
    })
    .await
    .expect("create thread")
    .id
}

async fn prompt(core: &Core, id: &ThreadId, text: &str) {
    core.thread_prompt(id.clone(), vec![ContentBlock::Text(text.into())])
        .await
        .expect("prompt");
}

/// Drains until the stream shows the expected turn text and then goes idle.
/// Earlier idle transitions (v2 announces idle after `new_session`) are ignored.
async fn drain_until_token_idle(stream: &mut tethys_api::EventStream, token: &str) {
    let mut count = 0;
    let mut saw_token = false;
    let mut text_seen = String::new();
    let mut seen = Vec::new();
    loop {
        let event = tokio::time::timeout(Duration::from_secs(10), stream.next())
            .await
            .unwrap_or_else(|_| panic!("event within timeout; saw {seen:?}"))
            .expect("stream open");
        seen.push(format!("{:?}", event.event));
        count += 1;
        match &event.event {
            tethys_schema::thread::TurnEventBody::MessageChunk(chunk) => {
                if let ContentBlock::Text(text) = &chunk.block {
                    text_seen.push_str(text);
                    saw_token = text_seen.contains(token);
                }
            }
            tethys_schema::thread::TurnEventBody::StateChanged(changed)
                if saw_token
                    && matches!(
                        changed.state,
                        tethys_schema::thread::SessionState::Idle { .. }
                    ) =>
            {
                return;
            }
            _ => {}
        }
        assert!(count <= 512, "idle after {token} never reached");
    }
}

fn entry_text(entries: &[Entry]) -> String {
    entries
        .iter()
        .filter_map(|entry| match entry {
            Entry::Message { blocks, .. } => Some(
                blocks
                    .iter()
                    .filter_map(|block| match block {
                        ContentBlock::Text(text) => Some(text.as_str()),
                        _ => None,
                    })
                    .collect::<String>(),
            ),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("")
}

async fn wait_for_state(core: &Core, id: &ThreadId, state: ThreadState) {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let view = core.thread_get(id.clone()).await.expect("get");
        if view.thread.state == state {
            return;
        }
        assert!(
            Instant::now() < deadline,
            "thread never reached {state:?}: {:?}",
            view.thread.state
        );
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

async fn mode_and_config_changes_dispatch_and_cache() {
    let core = build_core(Duration::from_millis(50));
    let bootstrap = core
        .thread_prepare(CreateThread {
            workspace_id: "workspace".into(),
            agent_profile_id: PROFILE_V1.into(),
            workdir: workdir("mode-config").display().to_string(),
            additional_directories: Vec::new(),
        })
        .await
        .expect("prepare");
    let id = bootstrap.thread.id.clone();

    let mode = bootstrap
        .config_options
        .iter()
        .find(|option| option.id == "mode")
        .expect("mode option from session/new");
    assert_eq!(mode.category.as_deref(), Some("mode"));
    assert_eq!(mode.current_value, "default");
    assert_eq!(mode.values, vec!["default", "plan", "accept-edits"]);
    assert!(
        bootstrap
            .config_options
            .iter()
            .any(|option| option.id == "thought_level"),
        "config options from session/new are preserved"
    );

    // A mode change dispatches to session/set_mode, not session/set_config_option.
    core.thread_set_config_option(id.clone(), "mode".into(), "plan".into())
        .await
        .expect("set mode");
    let view = core.thread_get(id.clone()).await.expect("get");
    let mode = view
        .config_options
        .iter()
        .find(|option| option.id == "mode")
        .expect("mode");
    assert_eq!(mode.current_value, "plan");
    assert!(view.events.iter().any(|envelope| matches!(
        &envelope.event,
        TurnEventBody::ConfigOptionsChanged { options }
            if options.iter().any(|option| option.id == "mode" && option.current_value == "plan")
    )));

    // An unknown mode is rejected before the wire call.
    let rejected = core
        .thread_set_config_option(id.clone(), "mode".into(), "nope".into())
        .await;
    assert!(matches!(
        rejected,
        Err(tethys_api::ApiError::InvalidConfig(_))
    ));

    // A config change dispatches to session/set_config_option and merges.
    core.thread_set_config_option(id.clone(), "thought_level".into(), "high".into())
        .await
        .expect("set config");
    let view = core.thread_get(id.clone()).await.expect("get");
    let level = view
        .config_options
        .iter()
        .find(|option| option.id == "thought_level")
        .expect("thought_level");
    assert_eq!(level.current_value, "high");
    let mode = view
        .config_options
        .iter()
        .find(|option| option.id == "mode")
        .expect("mode");
    assert_eq!(mode.current_value, "plan", "config update keeps the mode");

    core.thread_delete(id).await.expect("delete");
}

async fn auth_required_session_updates_profile_auth_state() {
    use tethys_schema::agents::{AuthState, ProviderHealth};

    let sessions = build_sessions(Duration::from_millis(50));
    let core = Core::with_sessions("test", sessions.clone());
    let result = core
        .thread_prepare(CreateThread {
            workspace_id: "workspace".into(),
            agent_profile_id: PROFILE_AUTH.into(),
            workdir: workdir("auth-required").display().to_string(),
            additional_directories: Vec::new(),
        })
        .await;

    assert!(
        matches!(result, Err(tethys_api::ApiError::AuthRequired(_))),
        "session/new auth-required surfaces as its own stage"
    );
    let record = sessions.health().record(PROFILE_AUTH);
    assert_eq!(record.health, ProviderHealth::AuthRequired);
    assert_eq!(record.auth_state, AuthState::Required);
}

async fn additional_directories_reach_the_session_and_stay_jailed() {
    let core = build_core(Duration::from_millis(50));
    let extra = workdir("extra");
    std::fs::write(extra.join("probe.txt"), "root-probe").expect("probe");

    let bootstrap = core
        .thread_prepare(CreateThread {
            workspace_id: "workspace".into(),
            agent_profile_id: PROFILE_V1.into(),
            workdir: workdir("additional").display().to_string(),
            additional_directories: vec!["extra".into()],
        })
        .await
        .expect("prepare");
    let id = bootstrap.thread.id.clone();

    let mut stream = core
        .events_subscribe(id.clone(), bootstrap.latest_seq)
        .await
        .expect("subscribe");
    prompt(&core, &id, "fs/read").await;
    drain_until_token_idle(&mut stream, "probe:root-probe").await;

    let latest = core.thread_get(id.clone()).await.expect("get").latest_seq;
    let mut stream = core
        .events_subscribe(id.clone(), latest)
        .await
        .expect("subscribe");
    prompt(&core, &id, "fs/read escape").await;
    drain_until_token_idle(&mut stream, "fs-error").await;

    let view = core.thread_get(id.clone()).await.expect("get");
    let text = entry_text(&view.entries);
    assert!(
        !text.contains("root:x:"),
        "a path outside the trusted roots must not be read: {text}"
    );
    core.thread_delete(id).await.expect("delete");
}

async fn provider_sessions_paginate_with_a_cursor() {
    let core = build_core(Duration::from_millis(50));
    let root = workdir("workspace");
    for index in 1..=3 {
        std::fs::create_dir_all(root.join(format!("session-{index}"))).expect("session dir");
    }

    let first = core
        .thread_list_provider_sessions(PROFILE_V1.into(), "workspace".into(), None)
        .await
        .expect("page 1");
    assert_eq!(first.sessions.len(), 2, "page size comes from the provider");
    assert_eq!(first.next_cursor.as_deref(), Some("page-2"));
    assert!(first
        .sessions
        .iter()
        .all(|session| session.cwd.starts_with(root.display().to_string().as_str())));

    let second = core
        .thread_list_provider_sessions(
            PROFILE_V1.into(),
            "workspace".into(),
            first.next_cursor.clone(),
        )
        .await
        .expect("page 2");
    assert_eq!(second.sessions.len(), 1);
    assert!(second.next_cursor.is_none());
    assert_eq!(second.sessions[0].title.as_deref(), Some("Listed 3"));
}

async fn prompt_streams_entries_and_backlog() {
    let core = build_core(Duration::from_secs(30));
    let id = create(&core, PROFILE_V1, "basic").await;
    let mut stream = core
        .events_subscribe(id.clone(), 0)
        .await
        .expect("subscribe");
    prompt(&core, &id, "hello").await;
    drain_until_token_idle(&mut stream, "hello").await;

    let view = core.thread_get(id.clone()).await.expect("get");
    assert_eq!(view.thread.state, ThreadState::Idle);
    assert!(entry_text(&view.entries).contains("echo: hello"));
    assert!(view.latest_seq > 0);

    // Backlog: a fresh subscription from 0 replays the same events.
    let mut replay = core
        .events_subscribe(id.clone(), 0)
        .await
        .expect("subscribe");
    let first = replay.next().await.expect("backlog event");
    assert_eq!(first.seq, 1);
    assert_eq!(first.thread_id, id);

    core.thread_delete(id).await.expect("delete");
}

async fn kill_mid_turn_marks_interrupted_and_resume_keeps_history() {
    let core = Arc::new(build_core(Duration::from_millis(50)));
    let id = create(&core, PROFILE_V1, "kill-resume").await;
    let mut stream = core
        .events_subscribe(id.clone(), 0)
        .await
        .expect("subscribe");
    prompt(&core, &id, "hello").await;
    drain_until_token_idle(&mut stream, "hello").await;

    let connections = core.agent_connections_list().await.expect("connections");
    let first = connections.first().expect("a connection");
    let key = ConnectionKey::new(first.key.profile_id.clone(), first.key.host.clone());

    // Kill the process while the next turn is running.
    let prompt_core = core.clone();
    let prompt_id = id.clone();
    let in_flight = tokio::spawn(async move {
        prompt_core
            .thread_prompt(prompt_id, vec![ContentBlock::Text("slow hello".into())])
            .await
    });
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let view = core.thread_get(id.clone()).await.expect("get");
        if view.thread.state == ThreadState::Running {
            break;
        }
        assert!(Instant::now() < deadline, "turn never started");
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    core.sessions()
        .store()
        .restart(&key)
        .await
        .expect("restart");
    let _ = in_flight.await;

    wait_for_state(&core, &id, ThreadState::Interrupted).await;
    core.thread_resume(id.clone()).await.expect("resume");
    prompt(&core, &id, "again").await;
    drain_until_token_idle(&mut stream, "again").await;

    let view = core.thread_get(id.clone()).await.expect("get");
    let text = entry_text(&view.entries);
    assert_eq!(
        text.matches("echo: hello").count(),
        1,
        "replay must not duplicate history: {text}"
    );
    assert!(text.contains("echo: again"), "new turn appended: {text}");
    assert_eq!(view.thread.state, ThreadState::Idle);

    core.thread_delete(id).await.expect("delete");
}

async fn reconnect_without_load_starts_fresh_session_once() {
    let core = build_core(Duration::from_millis(50));
    let bootstrap = core
        .thread_prepare(CreateThread {
            workspace_id: "workspace".into(),
            agent_profile_id: PROFILE_NO_LOAD.into(),
            workdir: workdir("no-load").display().to_string(),
            additional_directories: Vec::new(),
        })
        .await
        .expect("prepare");
    let id = bootstrap.thread.id.clone();
    let original_session = bootstrap.thread.session_id.expect("provider session");
    let mut stream = core
        .events_subscribe(id.clone(), bootstrap.latest_seq)
        .await
        .expect("subscribe");
    prompt(&core, &id, "before reconnect").await;
    drain_until_token_idle(&mut stream, "before reconnect").await;

    let key = ConnectionKey::new(PROFILE_NO_LOAD, "local");
    core.sessions()
        .store()
        .restart(&key)
        .await
        .expect("restart connection");

    let deadline = Instant::now() + Duration::from_secs(5);
    let view = loop {
        let view = core.thread_get(id.clone()).await.expect("reconnect");
        if view.thread.session_id.as_deref() != Some(original_session.as_str()) {
            break view;
        }
        assert!(
            Instant::now() < deadline,
            "fresh session was not created: {:?}",
            core.sessions().connections()
        );
        tokio::time::sleep(Duration::from_millis(20)).await;
    };
    assert_eq!(
        view.events
            .iter()
            .filter(|event| matches!(
                &event.event,
                TurnEventBody::Error { code, .. } if code == "provider_cannot_resume"
            ))
            .count(),
        1,
    );

    prompt(&core, &id, "after reconnect").await;
    drain_until_token_idle(&mut stream, "after reconnect").await;
    core.thread_delete(id).await.expect("delete");
}

async fn four_threads_across_two_workdirs_stay_isolated() {
    let core = build_core(Duration::from_secs(30));
    let mut threads = vec![
        create(&core, PROFILE_V1, "repo-a").await,
        create(&core, PROFILE_V1, "repo-a").await,
    ];
    #[cfg(feature = "acp-v2")]
    {
        threads.push(create(&core, PROFILE_V2, "repo-b").await);
        threads.push(create(&core, PROFILE_V2, "repo-b").await);
    }
    #[cfg(not(feature = "acp-v2"))]
    {
        threads.push(create(&core, PROFILE_V1, "repo-b").await);
        threads.push(create(&core, PROFILE_V1, "repo-b").await);
    }

    let mut streams = Vec::new();
    for id in &threads {
        streams.push(
            core.events_subscribe(id.clone(), 0)
                .await
                .expect("subscribe"),
        );
    }

    // Distinct prompts so each thread's entries prove isolation.
    let prompts: Vec<_> = threads
        .iter()
        .enumerate()
        .map(|(index, id)| {
            let text = format!("token-{index}");
            let core = &core;
            let id = id.clone();
            async move { prompt(core, &id, &text).await }
        })
        .collect();
    futures::future::join_all(prompts).await;

    for (index, stream) in streams.iter_mut().enumerate() {
        drain_until_token_idle(stream, &format!("token-{index}")).await;
    }

    for (index, id) in threads.iter().enumerate() {
        let view = core.thread_get(id.clone()).await.expect("get");
        let text = entry_text(&view.entries);
        let own = format!("token-{index}");
        assert!(text.contains(&own), "thread {index} missing {own}: {text}");
        for other in 0..threads.len() {
            if other != index {
                assert!(
                    !text.contains(&format!("token-{other}")),
                    "thread {index} leaked token-{other}: {text}"
                );
            }
        }
        core.thread_delete(id.clone()).await.expect("delete");
    }
}
