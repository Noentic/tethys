//! Cancel-phase timing tests (M1.12 U3) over real mock-agent processes
//! (harness = false so the test binary can re-exec itself as the mock vendor).

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures::stream::StreamExt;
use tethys_agent_servers::{ConnectionStore, LaunchSpec, StoreOptions};
use tethys_api::{AgentApi, EventsApi, ThreadApi};
use tethys_core::permission::DenyPermissionResolver;
use tethys_core::thread_session::{SyncSource, ThreadSessions};
use tethys_core::Core;
use tethys_schema::cancel::CancelPhase;
use tethys_schema::connection::{AcpProtocol, AgentCompat};
use tethys_schema::thread::{ContentBlock, CreateThread, EventEnvelope, ThreadId, TurnEventBody};

const PROFILE: &str = "mock-cancel";
const GRACE: Duration = Duration::from_millis(200);

fn main() {
    if tethys_acp::mock::run_if_requested() {
        return;
    }
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("runtime");
    runtime.block_on(async {
        cancel_emits_requested_then_grace_elapsed().await;
        a_second_press_force_kills_the_process_group().await;
        a_settled_turn_returns_to_idle().await;
    });
    println!("cancel phase tests passed");
}

fn workdir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("tethys-cancel-{name}"));
    std::fs::create_dir_all(&dir).expect("workdir");
    dir
}

fn build_core() -> Arc<Core> {
    let options = StoreOptions {
        idle_grace: Duration::from_secs(30),
        cancel_grace: GRACE,
        ..StoreOptions::new(AcpProtocol::V1, Arc::new(DenyPermissionResolver))
    };
    let roots = Arc::new(
        tethys_core::workspace_roots::StaticWorkspaces::new()
            .with("workspace", workdir("workspace")),
    );
    let sessions = Arc::new(ThreadSessions::new(
        ConnectionStore::new(options),
        SyncSource::new(
            workdir("sync-home"),
            Arc::new(tethys_sync::MemorySecrets::new()),
        ),
        roots,
    ));
    sessions.register_profile(
        LaunchSpec::new(
            PROFILE,
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
    Arc::new(Core::with_sessions("test", sessions))
}

async fn create(core: &Core, name: &str) -> ThreadId {
    core.thread_create(CreateThread {
        workspace_id: "workspace".into(),
        agent_profile_id: PROFILE.into(),
        workdir: workdir(name).display().to_string(),
        additional_directories: Vec::new(),
        isolation: None,
    })
    .await
    .expect("create thread")
    .id
}

async fn wait_for_running(core: &Core, id: &ThreadId) {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let view = core.thread_get(id.clone()).await.expect("get");
        if matches!(
            view.thread.state,
            tethys_schema::thread::ThreadState::Running
                | tethys_schema::thread::ThreadState::AwaitingApproval
        ) {
            return;
        }
        assert!(Instant::now() < deadline, "turn never started");
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

/// Polls the event stream until a cancel phase matching `want` arrives.
async fn wait_for_cancel(
    stream: &mut tethys_api::EventStream,
    want: impl Fn(&CancelPhase) -> bool,
) -> CancelPhase {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        let event: EventEnvelope = tokio::time::timeout(remaining, stream.next())
            .await
            .expect("cancel event within timeout")
            .expect("stream open");
        if let TurnEventBody::CancelPhaseChanged(state) = event.event {
            if want(&state.phase) {
                return state.phase;
            }
        }
        assert!(Instant::now() < deadline, "cancel phase never arrived");
    }
}

async fn cancel_emits_requested_then_grace_elapsed() {
    let core = build_core();
    let id = create(&core, "grace").await;
    let mut stream = core
        .events_subscribe(id.clone(), 0)
        .await
        .expect("subscribe");

    let prompt_core = core.clone();
    let prompt_id = id.clone();
    let turn = tokio::spawn(async move {
        prompt_core
            .thread_prompt(prompt_id, vec![ContentBlock::Text("slow hello".into())])
            .await
    });
    wait_for_running(&core, &id).await;

    core.thread_cancel(id.clone()).await.expect("cancel");
    let requested = wait_for_cancel(&mut stream, |phase| {
        matches!(phase, CancelPhase::CancelRequested { .. })
    })
    .await;
    let CancelPhase::CancelRequested { grace_deadline } = requested else {
        unreachable!()
    };
    // Deadline shape: parses as RFC 3339 and is ~grace after now.
    let parsed = time::OffsetDateTime::parse(
        &grace_deadline,
        &time::format_description::well_known::Rfc3339,
    )
    .expect("RFC 3339 deadline");
    assert!(parsed > time::OffsetDateTime::now_utc());

    // Snapshot returns the in-flight phase for a late subscriber.
    let snap = core.thread_cancel_state(id.clone()).await.expect("state");
    assert!(matches!(snap.phase, CancelPhase::CancelRequested { .. }));

    wait_for_cancel(&mut stream, |phase| {
        matches!(phase, CancelPhase::GraceElapsed)
    })
    .await;
    let snap = core.thread_cancel_state(id.clone()).await.expect("state");
    assert!(
        matches!(snap.phase, CancelPhase::GraceElapsed),
        "grace elapses without acknowledgement: {:?}",
        snap.phase
    );

    // Let the slow turn finish so the process is reaped cleanly.
    let _ = turn.await;
}

async fn a_second_press_force_kills_the_process_group() {
    let core = build_core();
    let id = create(&core, "force-kill").await;
    let mut stream = core
        .events_subscribe(id.clone(), 0)
        .await
        .expect("subscribe");

    let prompt_core = core.clone();
    let prompt_id = id.clone();
    let turn = tokio::spawn(async move {
        prompt_core
            .thread_prompt(prompt_id, vec![ContentBlock::Text("slow hello".into())])
            .await
    });
    wait_for_running(&core, &id).await;

    let pid = core
        .agent_connections_list()
        .await
        .expect("connections")
        .into_iter()
        .find_map(|entry| entry.pid)
        .expect("connection pid");

    core.thread_cancel(id.clone()).await.expect("first press");
    wait_for_cancel(&mut stream, |phase| {
        matches!(phase, CancelPhase::CancelRequested { .. })
    })
    .await;
    wait_for_cancel(&mut stream, |phase| {
        matches!(phase, CancelPhase::GraceElapsed)
    })
    .await;

    core.thread_cancel(id.clone()).await.expect("second press");
    wait_for_cancel(&mut stream, |phase| {
        matches!(phase, CancelPhase::Terminating)
    })
    .await;

    #[cfg(unix)]
    {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let alive = unsafe { libc::kill(-(pid as i32), 0) } == 0;
            if !alive {
                break;
            }
            assert!(Instant::now() < deadline, "process group still alive");
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }
    let _ = turn.await;
}

async fn a_settled_turn_returns_to_idle() {
    let core = build_core();
    let id = create(&core, "settled").await;
    let mut stream = core
        .events_subscribe(id.clone(), 0)
        .await
        .expect("subscribe");

    // Cancel a live but fast turn; whether it lands mid-turn or after, the
    // phase must return to Idle once the prompt resolves.
    let prompt_core = core.clone();
    let prompt_id = id.clone();
    let turn = tokio::spawn(async move {
        prompt_core
            .thread_prompt(prompt_id, vec![ContentBlock::Text("quick".into())])
            .await
    });
    tokio::time::sleep(Duration::from_millis(30)).await;
    let _ = core.thread_cancel(id.clone()).await;
    let _ = turn.await;

    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let snap = core.thread_cancel_state(id.clone()).await.expect("state");
        if matches!(snap.phase, CancelPhase::Idle) {
            break;
        }
        assert!(Instant::now() < deadline, "cancel never returned to idle");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    // Drain to keep the subscriber alive until the turn settled.
    let _ = stream.next().await;
}
