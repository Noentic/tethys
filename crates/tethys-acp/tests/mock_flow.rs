//! In-process mock lifecycle tests (feature `mock`):
//! `cargo test -p tethys-acp --features mock` (add `acp-v2` for the v2 cases).

#![cfg(feature = "mock")]

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use agent_client_protocol::Channel;
use async_trait::async_trait;
use futures::stream::StreamExt;
use tethys_acp::{connect, AcpConnectOptions};
use tethys_schema::connection::AcpProtocol;
use tethys_schema::thread::{
    ContentBlock, Decider, PermOutcome, PermissionRequested, TurnEventBody,
};
#[cfg(feature = "acp-v2")]
use tethys_thread::ResumeSession;
use tethys_thread::{
    AgentConnection, ConnectionEvent, NewSession, PermissionDecision, PermissionResolver,
};

struct AutoApprove;

#[async_trait]
impl PermissionResolver for AutoApprove {
    async fn resolve(&self, request: PermissionRequested) -> PermissionDecision {
        PermissionDecision {
            outcome: PermOutcome::Approved,
            option_id: request
                .options
                .iter()
                .find(|option| option.option_id == "allow")
                .map(|option| option.option_id.clone()),
            decided_by: Decider::Policy,
        }
    }
}

fn options() -> AcpConnectOptions {
    AcpConnectOptions::new(AcpProtocol::V1, Arc::new(AutoApprove))
}

async fn collect_until_idle(
    events: &mut tethys_thread::EventStream,
    limit: usize,
    require_running: bool,
) -> Vec<ConnectionEvent> {
    let mut collected = Vec::new();
    let mut saw_running = false;
    for _ in 0..limit {
        let event = tokio::time::timeout(Duration::from_secs(5), events.next())
            .await
            .expect("event within timeout")
            .expect("stream open")
            .expect("event ok");
        let is_idle = matches!(
            &event.body,
            TurnEventBody::StateChanged(changed)
                if matches!(
                    changed.state,
                    tethys_schema::thread::SessionState::Idle { .. }
                )
        );
        if matches!(
            &event.body,
            TurnEventBody::StateChanged(changed)
                if changed.state == tethys_schema::thread::SessionState::Running
        ) {
            saw_running = true;
        }
        collected.push(event);
        if is_idle && (!require_running || saw_running) {
            break;
        }
    }
    collected
}

#[tokio::test]
async fn v1_mock_streams_chunks_and_permission_round_trip() {
    let (client_channel, agent_channel) = Channel::duplex();
    let server = tokio::spawn(async move { tethys_acp::mock::serve_v1(agent_channel).await });

    let connection = connect(options(), client_channel)
        .await
        .expect("connect v1");
    assert_eq!(connection.info().name, "tethys-mock-v1");

    let session = connection
        .new_session(NewSession {
            cwd: PathBuf::from("/tmp/mock-v1"),
            additional_directories: vec![],
            mcp_servers: vec![],
        })
        .await
        .expect("new session");
    let mut events = connection.events(&session.id);

    connection
        .prompt(
            &session.id,
            vec![ContentBlock::Text("hello permission please".into())],
        )
        .await
        .expect("prompt");

    let collected = collect_until_idle(&mut events, 32, false).await;
    assert!(
        collected
            .iter()
            .any(|event| matches!(event.body, TurnEventBody::PermissionRequested(_))),
        "permission requested: {collected:?}"
    );
    assert!(
        collected
            .iter()
            .any(|event| matches!(event.body, TurnEventBody::PermissionResolved { .. })),
        "permission resolved: {collected:?}"
    );
    let text = collected
        .iter()
        .filter_map(|event| match &event.body {
            TurnEventBody::MessageChunk(chunk) => match &chunk.block {
                ContentBlock::Text(text) => Some(text.as_str()),
                _ => None,
            },
            _ => None,
        })
        .collect::<String>();
    assert!(
        text.contains("hello permission please"),
        "echo text: {text:?}"
    );
    assert!(collected.iter().all(|event| !event.replayed));

    drop(events);
    drop(connection);
    let _ = tokio::time::timeout(Duration::from_secs(5), server).await;
}

#[cfg(feature = "acp-v2")]
#[tokio::test]
async fn v2_mock_streams_state_chunks_and_replay() {
    use tethys_acp::AcpConnection;

    let (client_channel, agent_channel) = Channel::duplex();
    let server = tokio::spawn(async move { tethys_acp::mock::serve_v2(agent_channel).await });

    let mut options = AcpConnectOptions::new(AcpProtocol::V2, Arc::new(AutoApprove));
    options.client_name = "tethys-test".into();
    let connection: AcpConnection = connect(options, client_channel).await.expect("connect v2");
    assert_eq!(connection.protocol(), AcpProtocol::V2);

    let session = connection
        .new_session(NewSession {
            cwd: PathBuf::from("/tmp/mock-v2"),
            additional_directories: vec![],
            mcp_servers: vec![],
        })
        .await
        .expect("new session");
    let mut events = connection.events(&session.id);

    connection
        .prompt(&session.id, vec![ContentBlock::Text("hello v2".into())])
        .await
        .expect("prompt");

    let collected = collect_until_idle(&mut events, 32, true).await;
    let text = collected
        .iter()
        .filter_map(|event| match &event.body {
            TurnEventBody::MessageChunk(chunk) => match &chunk.block {
                ContentBlock::Text(text) => Some(text.as_str()),
                _ => None,
            },
            _ => None,
        })
        .collect::<String>();
    assert!(text.contains("hello v2"), "echo text: {text:?}");

    // Resume with replay: the transcript arrives marked as replayed.
    connection
        .resume_session(ResumeSession {
            session_id: session.id.clone(),
            cwd: PathBuf::from("/tmp/mock-v2"),
            additional_directories: vec![],
            mcp_servers: vec![],
            replay: true,
        })
        .await
        .expect("resume");

    let mut replayed = Vec::new();
    for _ in 0..8 {
        match tokio::time::timeout(Duration::from_secs(5), events.next()).await {
            Ok(Some(Ok(event))) => {
                let is_replay = event.replayed;
                replayed.push(event);
                if is_replay && replayed.iter().filter(|event| event.replayed).count() >= 2 {
                    break;
                }
            }
            Ok(Some(Err(error))) => panic!("stream error: {error}"),
            Ok(None) => break,
            Err(_) => break,
        }
    }
    assert!(
        replayed.iter().any(|event| event.replayed),
        "resume replay events marked: {replayed:?}"
    );

    drop(events);
    drop(connection);
    let _ = tokio::time::timeout(Duration::from_secs(5), server).await;
}

#[tokio::test]
async fn v1_cancel_is_accepted() {
    let (client_channel, agent_channel) = Channel::duplex();
    let server = tokio::spawn(async move { tethys_acp::mock::serve_v1(agent_channel).await });
    let connection = connect(options(), client_channel)
        .await
        .expect("connect v1");
    let session = connection
        .new_session(NewSession {
            cwd: PathBuf::from("/tmp/mock-v1"),
            additional_directories: vec![],
            mcp_servers: vec![],
        })
        .await
        .expect("new session");
    connection.cancel(&session.id).await.expect("cancel");
    drop(connection);
    let _ = tokio::time::timeout(Duration::from_secs(5), server).await;
}

#[test]
fn connect_v2_without_feature_is_typed_unsupported() {
    #[cfg(not(feature = "acp-v2"))]
    {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");
        let result = runtime.block_on(async {
            let (client_channel, _agent_channel) = Channel::duplex();
            connect(
                AcpConnectOptions::new(AcpProtocol::V2, Arc::new(AutoApprove)),
                client_channel,
            )
            .await
        });
        match result {
            Err(tethys_thread::ConnectionError::Unsupported(m)) => assert_eq!(m, "acp_v2"),
            Err(other) => panic!("expected Unsupported, got {other:?}"),
            Ok(_) => panic!("expected Unsupported, got a connection"),
        }
    }
}
