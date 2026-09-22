//! In-process mock lifecycle tests (feature `mock`):
//! `cargo test -p tethys-acp --features mock` (add `acp-v2` for the v2 cases).

#![cfg(feature = "mock")]

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use agent_client_protocol::Channel;
use async_trait::async_trait;
use futures::stream::StreamExt;
use tethys_acp::{connect, AcpConnectOptions, AcpProviderIntegration};
use tethys_schema::connection::AcpProtocol;
use tethys_schema::elicitation::{
    ElicitationOutcome, ElicitationRequest, ElicitationResponse, ElicitationValue,
};
use tethys_schema::thread::{
    ContentBlock, Decider, PermOutcome, PermissionRequested, TurnEventBody,
};
#[cfg(feature = "acp-v2")]
use tethys_thread::ResumeSession;
use tethys_thread::{
    AgentConnection, ConnectionEvent, ElicitationResolver, NewSession, PermissionDecision,
    PermissionResolver, SessionId,
};

struct AutoApprove;

struct AutoElicit;

#[async_trait]
impl PermissionResolver for AutoApprove {
    async fn resolve(
        &self,
        _session: &SessionId,
        request: PermissionRequested,
    ) -> PermissionDecision {
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

#[async_trait]
impl ElicitationResolver for AutoElicit {
    async fn resolve(
        &self,
        _session: &SessionId,
        request: ElicitationRequest,
    ) -> ElicitationResponse {
        let values = request
            .fields
            .iter()
            .any(|field| field.key == "name")
            .then(|| {
                BTreeMap::from([("name".to_string(), ElicitationValue::Text("tethys".into()))])
            })
            .unwrap_or_default();
        ElicitationResponse::accepted(request.req_id, values)
    }
}

fn options() -> AcpConnectOptions {
    AcpConnectOptions::new(AcpProtocol::V1, Arc::new(AutoApprove))
}

fn options_with_elicitation() -> AcpConnectOptions {
    let mut options = options();
    options.services = options.services.with_elicitation(Arc::new(AutoElicit));
    options
}

fn extension_integration(
    handler: Option<tethys_acp::client::ExtensionRequestHandler>,
) -> AcpProviderIntegration {
    AcpProviderIntegration {
        id: "fixture".into(),
        initialize_meta: Default::default(),
        extension_methods: vec!["_fixture.dev/action".into()],
        extension_request_handler: handler,
        extension_notification_handler: None,
    }
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

#[tokio::test]
async fn v1_form_url_elicitation_and_terminal_lifecycle_round_trip() {
    let (client_channel, agent_channel) = Channel::duplex();
    let server = tokio::spawn(async move { tethys_acp::mock::serve_v1(agent_channel).await });
    let connection = connect(options_with_elicitation(), client_channel)
        .await
        .expect("connect v1");
    let root = std::env::temp_dir().join(format!("tethys-acp-callbacks-{}", std::process::id()));
    std::fs::create_dir_all(&root).expect("session root");
    let session = connection
        .new_session(NewSession {
            cwd: root,
            additional_directories: vec![],
            mcp_servers: vec![],
        })
        .await
        .expect("new session");
    let mut events = connection.events(&session.id);

    connection
        .prompt(&session.id, vec![ContentBlock::Text("elicit-form".into())])
        .await
        .expect("form elicitation");
    let form = collect_until_idle(&mut events, 32, false).await;
    assert!(form.iter().any(|event| matches!(
        &event.body,
        TurnEventBody::ElicitationRequested(request)
            if request.fields.iter().any(|field| field.key == "name")
    )));
    assert!(form.iter().any(|event| matches!(
        &event.body,
        TurnEventBody::ElicitationResolved { outcome, values, .. }
            if *outcome == ElicitationOutcome::Accepted && values.contains_key("name")
    )));

    connection
        .prompt(&session.id, vec![ContentBlock::Text("elicit-url".into())])
        .await
        .expect("url elicitation");
    let url = collect_until_idle(&mut events, 32, true).await;
    assert!(url.iter().any(|event| matches!(
        &event.body,
        TurnEventBody::ElicitationRequested(request)
            if request.url.as_deref() == Some("https://example.test/authorize")
    )));

    connection
        .prompt(
            &session.id,
            vec![ContentBlock::Text("terminal-lifecycle".into())],
        )
        .await
        .expect("terminal lifecycle");
    let terminal = collect_until_idle(&mut events, 64, true).await;
    assert!(terminal.iter().any(|event| matches!(
        &event.body,
        TurnEventBody::TerminalOutputChunk { bytes, .. } if bytes.contains("terminal-ok")
    )));
    assert_eq!(
        terminal
            .iter()
            .filter(|event| matches!(
                &event.body,
                TurnEventBody::TerminalUpsert {
                    patch: tethys_schema::thread::Patch::Clear,
                    ..
                }
            ))
            .count(),
        2,
    );

    drop(events);
    drop(connection);
    let _ = tokio::time::timeout(Duration::from_secs(5), server).await;
}

#[tokio::test]
async fn v1_without_an_elicitation_resolver_cancels_the_callback() {
    let (client_channel, agent_channel) = Channel::duplex();
    let server = tokio::spawn(async move { tethys_acp::mock::serve_v1(agent_channel).await });
    let connection = connect(options(), client_channel)
        .await
        .expect("connect v1");
    assert!(
        !connection.capabilities().elicitation,
        "elicitation must not be advertised without a resolver"
    );
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
        .prompt(&session.id, vec![ContentBlock::Text("elicit-form".into())])
        .await
        .expect("prompt");

    let collected = collect_until_idle(&mut events, 32, true).await;
    assert!(
        !collected.iter().any(|event| matches!(
            &event.body,
            TurnEventBody::ElicitationRequested(_) | TurnEventBody::ElicitationResolved { .. }
        )),
        "a cancelled callback must not emit elicitation events: {collected:?}"
    );

    drop(events);
    drop(connection);
    let _ = tokio::time::timeout(Duration::from_secs(5), server).await;
}

#[tokio::test]
async fn v1_extension_request_is_answered_by_the_registered_handler() {
    let (client_channel, agent_channel) = Channel::duplex();
    let server = tokio::spawn(async move { tethys_acp::mock::serve_v1(agent_channel).await });
    let mut connect_options = options();
    connect_options.integration = Some(extension_integration(Some(Arc::new(|method, _params| {
        (method == "_fixture.dev/action").then(|| serde_json::json!({ "handled": "backend" }))
    }))));
    let connection = Arc::new(
        connect(connect_options, client_channel)
            .await
            .expect("connect v1"),
    );
    let session = connection
        .new_session(NewSession {
            cwd: PathBuf::from("/tmp/mock-v1-extension-handler"),
            additional_directories: vec![],
            mcp_servers: vec![],
        })
        .await
        .expect("new session");
    let mut events = connection.events(&session.id);
    connection
        .prompt(&session.id, vec![ContentBlock::Text("extension".into())])
        .await
        .expect("extension prompt");

    let collected = collect_until_idle(&mut events, 16, false).await;
    let response_text = collected
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
        response_text.contains("backend"),
        "the registered handler's response reaches the agent: {response_text}"
    );
    assert!(
        collected
            .iter()
            .all(|event| !matches!(event.body, TurnEventBody::ProviderExtension(_))),
        "an answered request never surfaces as pending UI work"
    );

    drop(events);
    drop(connection);
    let _ = tokio::time::timeout(Duration::from_secs(5), server).await;
}

#[tokio::test]
async fn v1_claimed_extension_request_round_trips_through_the_event_stream() {
    let (client_channel, agent_channel) = Channel::duplex();
    let server = tokio::spawn(async move { tethys_acp::mock::serve_v1(agent_channel).await });
    let mut connect_options = options();
    connect_options.integration = Some(extension_integration(None));
    let connection = Arc::new(
        connect(connect_options, client_channel)
            .await
            .expect("connect v1"),
    );
    let session = connection
        .new_session(NewSession {
            cwd: PathBuf::from("/tmp/mock-v1-extension"),
            additional_directories: vec![],
            mcp_servers: vec![],
        })
        .await
        .expect("new session");
    let mut events = connection.events(&session.id);
    let session_id = session.id.clone();
    let prompt_connection = connection.clone();
    let prompt = tokio::spawn(async move {
        prompt_connection
            .prompt(&session_id, vec![ContentBlock::Text("extension".into())])
            .await
    });

    let extension = loop {
        let event = tokio::time::timeout(Duration::from_secs(5), events.next())
            .await
            .expect("extension event within timeout")
            .expect("stream open")
            .expect("event ok");
        if let TurnEventBody::ProviderExtension(extension) = event.body {
            break extension;
        }
    };
    assert_eq!(extension.method, "_fixture.dev/action");
    let request_id = extension.request_id.expect("request correlation id");
    connection
        .respond_extension(
            &session.id,
            &request_id,
            serde_json::json!({ "actionId": "approve" }),
        )
        .await
        .expect("extension response");
    prompt.await.expect("prompt task").expect("prompt response");

    let collected = collect_until_idle(&mut events, 16, false).await;
    let response_text = collected
        .iter()
        .filter_map(|event| match &event.body {
            TurnEventBody::MessageChunk(chunk) => match &chunk.block {
                ContentBlock::Text(text) => Some(text.as_str()),
                _ => None,
            },
            _ => None,
        })
        .collect::<String>();
    assert!(response_text.contains(r#"{"actionId":"approve"}"#));

    drop(events);
    drop(connection);
    let _ = tokio::time::timeout(Duration::from_secs(5), server).await;
}

#[tokio::test]
async fn v1_unclaimed_extension_request_fails_prompt_without_waiting() {
    let (client_channel, agent_channel) = Channel::duplex();
    let server = tokio::spawn(async move { tethys_acp::mock::serve_v1(agent_channel).await });
    let connection = connect(options(), client_channel)
        .await
        .expect("connect v1");
    let session = connection
        .new_session(NewSession {
            cwd: PathBuf::from("/tmp/mock-v1-unclaimed-extension"),
            additional_directories: vec![],
            mcp_servers: vec![],
        })
        .await
        .expect("new session");

    let result = tokio::time::timeout(
        Duration::from_secs(5),
        connection.prompt(&session.id, vec![ContentBlock::Text("extension".into())]),
    )
    .await
    .expect("unclaimed extension fails promptly");
    assert!(result.is_err(), "unclaimed extension must not succeed");

    drop(connection);
    let _ = tokio::time::timeout(Duration::from_secs(5), server).await;
}

#[tokio::test]
async fn v1_disconnect_releases_pending_extension_request() {
    let (client_channel, agent_channel) = Channel::duplex();
    let server = tokio::spawn(async move { tethys_acp::mock::serve_v1(agent_channel).await });
    let mut connect_options = options();
    connect_options.integration = Some(extension_integration(None));
    let connection = Arc::new(
        connect(connect_options, client_channel)
            .await
            .expect("connect v1"),
    );
    let session = connection
        .new_session(NewSession {
            cwd: PathBuf::from("/tmp/mock-v1-disconnect-extension"),
            additional_directories: vec![],
            mcp_servers: vec![],
        })
        .await
        .expect("new session");
    let mut events = connection.events(&session.id);
    let prompt_connection = connection.clone();
    let session_id = session.id.clone();
    let prompt = tokio::spawn(async move {
        prompt_connection
            .prompt(&session_id, vec![ContentBlock::Text("extension".into())])
            .await
    });

    loop {
        let event = tokio::time::timeout(Duration::from_secs(5), events.next())
            .await
            .expect("extension event within timeout")
            .expect("stream open")
            .expect("event ok");
        if matches!(event.body, TurnEventBody::ProviderExtension(_)) {
            break;
        }
    }

    server.abort();
    tokio::time::timeout(Duration::from_secs(5), connection.wait_closed())
        .await
        .expect("connection close observed");
    let resolved = loop {
        let event = tokio::time::timeout(Duration::from_secs(5), events.next())
            .await
            .expect("extension resolution within timeout")
            .expect("stream remains readable")
            .expect("event ok");
        if let TurnEventBody::ProviderExtensionResolved {
            cancelled: true, ..
        } = event.body
        {
            break true;
        }
    };
    assert!(resolved);
    assert!(tokio::time::timeout(Duration::from_secs(5), prompt)
        .await
        .expect("prompt returns after disconnect")
        .expect("prompt task joins")
        .is_err());
}

#[tokio::test]
async fn v1_contract_fixtures_reach_normalized_events() {
    use tethys_schema::thread::{StopReason, ToolCallContent, ToolKind};

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
    let mut events = connection.events(&session.id);

    connection
        .prompt(
            &session.id,
            vec![ContentBlock::Text("contract fixtures".into())],
        )
        .await
        .expect("prompt");

    let collected = collect_until_idle(&mut events, 64, false).await;

    let kinds: Vec<ToolKind> = collected
        .iter()
        .filter_map(|event| match &event.body {
            TurnEventBody::ToolCallUpsert { patch, .. } => patch.kind,
            _ => None,
        })
        .collect();
    for kind in [
        ToolKind::Read,
        ToolKind::Edit,
        ToolKind::Delete,
        ToolKind::Move,
        ToolKind::Search,
        ToolKind::Execute,
        ToolKind::Think,
        ToolKind::Fetch,
        ToolKind::SwitchMode,
        ToolKind::Other,
    ] {
        assert!(kinds.contains(&kind), "missing kind {kind:?}: {kinds:?}");
    }

    assert!(
        collected.iter().any(|event| matches!(
            &event.body,
            TurnEventBody::ToolCallContentChunk {
                item: ToolCallContent::Diff { path, patch },
                ..
            } if path == "/tmp/contract.txt" && !patch.is_empty()
        )),
        "diff content: {collected:?}"
    );

    assert!(
        collected.iter().any(|event| matches!(
            &event.body,
            TurnEventBody::Usage { snapshot }
                if snapshot.context_size == Some(200_000)
                    && snapshot.cost_currency.as_deref() == Some("USD")
        )),
        "usage: {collected:?}"
    );

    assert!(
        collected.iter().any(|event| matches!(
            &event.body,
            TurnEventBody::ConfigOptionsChanged { options }
                if options.iter().any(|option| option.category.as_deref() == Some("thought_level")
                    && option.kind == Some(tethys_schema::thread::ConfigOptionKind::Select)
                    && option.value_options.iter().any(|value| value.id == "low" && value.name == "Low"))
                    && options.iter().any(|option| option.category.as_deref() == Some("model"))
        )),
        "config options: {collected:?}"
    );

    assert!(
        collected.iter().any(|event| matches!(
            &event.body,
            TurnEventBody::StateChanged(changed)
                if changed.state
                    == tethys_schema::thread::SessionState::Idle {
                        stop_reason: Some(StopReason::MaxTurnRequests),
                    }
        )),
        "max turn requests stop reason: {collected:?}"
    );

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

#[cfg(feature = "acp-v2")]
#[tokio::test]
async fn v2_form_elicitation_round_trip() {
    use tethys_acp::AcpConnection;

    let (client_channel, agent_channel) = Channel::duplex();
    let server = tokio::spawn(async move { tethys_acp::mock::serve_v2(agent_channel).await });

    let mut options = AcpConnectOptions::new(AcpProtocol::V2, Arc::new(AutoApprove));
    options.services = options.services.with_elicitation(Arc::new(AutoElicit));
    let connection: AcpConnection = connect(options, client_channel).await.expect("connect v2");

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
        .prompt(&session.id, vec![ContentBlock::Text("elicit-form".into())])
        .await
        .expect("prompt");

    let collected = collect_until_idle(&mut events, 32, true).await;
    assert!(
        collected.iter().any(|event| matches!(
            &event.body,
            TurnEventBody::ElicitationRequested(request)
                if request.fields.iter().any(|field| field.key == "name")
        )),
        "v2 elicitation request: {collected:?}"
    );
    assert!(
        collected.iter().any(|event| matches!(
            &event.body,
            TurnEventBody::ElicitationResolved { outcome, values, .. }
                if *outcome == ElicitationOutcome::Accepted && values.contains_key("name")
        )),
        "v2 elicitation outcome: {collected:?}"
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
