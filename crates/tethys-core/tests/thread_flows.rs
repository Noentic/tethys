//! End-to-end thread flows over real mock-agent processes (harness = false so
//! the binary can re-exec itself as the mock vendor).

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures::stream::StreamExt;
use tethys_agent_servers::{ConnectionStore, LaunchSpec, StoreOptions};
use tethys_api::TethysApi;
use tethys_core::thread_session::{DenyPermissionResolver, ThreadSessions};
use tethys_core::Core;
use tethys_schema::connection::{AcpProtocol, AgentCompat, ConnectionKey};
use tethys_schema::thread::{ContentBlock, CreateThread, Entry, ThreadId, ThreadState};

const PROFILE_V1: &str = "mock-v1";
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
        four_threads_across_two_workdirs_stay_isolated().await;
    });
    println!("thread_flows tests passed");
}

fn workdir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("tethys-thread-flows-{name}"));
    std::fs::create_dir_all(&dir).expect("workdir");
    dir
}

fn build_core(grace: Duration) -> Core {
    let options = StoreOptions {
        idle_grace: grace,
        cancel_grace: Duration::from_millis(200),
        ..StoreOptions::new(AcpProtocol::V1, Arc::new(DenyPermissionResolver))
    };
    let roots = Arc::new(
        tethys_core::workspace_roots::StaticWorkspaces::new()
            .with("workspace", workdir("workspace")),
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
    Core::with_sessions("test", sessions)
}

async fn create(core: &Core, profile: &str, name: &str) -> ThreadId {
    core.thread_create(CreateThread {
        workspace_id: "workspace".into(),
        agent_profile_id: profile.into(),
        workdir: workdir(name).display().to_string(),
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
    loop {
        let event = tokio::time::timeout(Duration::from_secs(10), stream.next())
            .await
            .expect("event within timeout")
            .expect("stream open");
        count += 1;
        match &event.event {
            tethys_schema::thread::TurnEventBody::MessageChunk(chunk) => {
                if let ContentBlock::Text(text) = &chunk.block {
                    if text.contains(token) {
                        saw_token = true;
                    }
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
    assert_eq!(first.seq, 0);
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
