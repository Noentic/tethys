//! Mock vendor agents for tests (feature `mock`).
//!
//! `run_if_requested` turns the current process into a stdio mock agent when
//! `TETHYS_MOCK_ACP` is `v1`/`v2`; `serve_v1`/`serve_v2` run the same agents
//! over an in-process transport. Both echo prompts, stream chunks, and ask for
//! permission when the prompt contains `permission`.
use agent_client_protocol::schema::v1 as acp1;
use agent_client_protocol::{Agent, Error, Responder, Result, Stdio};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;

/// Environment variable that turns a re-executed test binary into a mock agent.
pub const MOCK_ENV: &str = "TETHYS_MOCK_ACP";

/// Runs the requested mock agent (blocking). Returns `false` when this process
/// is not a mock agent.
pub fn run_if_requested() -> bool {
    let Ok(kind) = std::env::var(MOCK_ENV) else {
        return false;
    };
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            eprintln!("mock agent runtime failed: {error}");
            std::process::exit(1);
        }
    };
    let result = match kind.as_str() {
        "v1" => runtime.block_on(run_v1()),
        "v2" => {
            #[cfg(feature = "acp-v2")]
            {
                runtime.block_on(run_v2())
            }
            #[cfg(not(feature = "acp-v2"))]
            {
                eprintln!("mock agent v2 requested but the acp-v2 feature is off");
                std::process::exit(1);
            }
        }
        other => {
            eprintln!("unknown TETHYS_MOCK_ACP value: {other}");
            std::process::exit(1);
        }
    };
    if let Err(error) = result {
        eprintln!("mock agent failed: {error}");
        std::process::exit(1);
    }
    true
}
#[derive(Default)]
struct MockStateV1 {
    next_session: u32,
    next_message: u32,
    history: HashMap<String, Vec<acp1::SessionUpdate>>,
}

/// Runs the v1 mock agent over stdio.
pub async fn run_v1() -> Result<()> {
    serve_v1(Stdio::new()).await
}

/// Serves the v1 mock agent over any agent-role transport.
pub async fn serve_v1(transport: impl agent_client_protocol::ConnectTo<Agent>) -> Result<()> {
    let state = Arc::new(Mutex::new(MockStateV1::default()));
    Agent
        .builder()
        .name("tethys-mock-v1")
        .on_receive_request(
            async |request: acp1::InitializeRequest,
                   responder: Responder<acp1::InitializeResponse>,
                   _connection| {
                responder.respond(
                    acp1::InitializeResponse::new(request.protocol_version)
                        .agent_info(acp1::Implementation::new("tethys-mock-v1", "0.0.0"))
                        .agent_capabilities(acp1::AgentCapabilities::new().load_session(true)),
                )
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            {
                let state = state.clone();
                async move |_request: acp1::NewSessionRequest,
                            responder: Responder<acp1::NewSessionResponse>,
                            _connection| {
                    let mut state = state.lock();
                    state.next_session += 1;
                    let session_id = format!("mock-v1-session-{}", state.next_session);
                    state.history.insert(session_id.clone(), Vec::new());
                    responder.respond(acp1::NewSessionResponse::new(session_id))
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            {
                let state = state.clone();
                async move |request: acp1::LoadSessionRequest,
                            responder: Responder<acp1::LoadSessionResponse>,
                            connection: agent_client_protocol::ConnectionTo<
                    agent_client_protocol::Client,
                >| {
                    let session_id = request.session_id.to_string();
                    let history = state
                        .lock()
                        .history
                        .get(&session_id)
                        .cloned()
                        .unwrap_or_default();
                    let notify = connection.clone();
                    connection.spawn(async move {
                        for update in history {
                            notify
                                .send_notification(acp1::SessionNotification::new(
                                    session_id.clone(),
                                    update,
                                ))
                                .map_err(Error::into_internal_error)?;
                        }
                        responder.respond(acp1::LoadSessionResponse::new())
                    })?;
                    Ok(())
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            {
                let state = state.clone();
                async move |request: acp1::PromptRequest,
                            responder: Responder<acp1::PromptResponse>,
                            connection: agent_client_protocol::ConnectionTo<
                    agent_client_protocol::Client,
                >| {
                    let session_id = request.session_id.to_string();
                    let prompt = prompt_text_v1(&request.prompt);
                    let state = state.clone();
                    let notify = connection.clone();
                    connection.spawn(async move {
                        if prompt.contains("slow") {
                            tokio::time::sleep(std::time::Duration::from_millis(750)).await;
                        }
                        if prompt.contains("contract") {
                            for update in contract_fixture_updates() {
                                notify
                                    .send_notification(acp1::SessionNotification::new(
                                        session_id.clone(),
                                        update,
                                    ))
                                    .map_err(Error::into_internal_error)?;
                            }
                            responder.respond(acp1::PromptResponse::new(
                                acp1::StopReason::MaxTurnRequests,
                            ))?;
                            return Ok(());
                        }
                        if prompt.contains("permission") {
                            let options = vec![
                                acp1::PermissionOption::new(
                                    "allow",
                                    "Allow",
                                    acp1::PermissionOptionKind::AllowOnce,
                                ),
                                acp1::PermissionOption::new(
                                    "deny",
                                    "Deny",
                                    acp1::PermissionOptionKind::RejectOnce,
                                ),
                            ];
                            let request = acp1::RequestPermissionRequest::new(
                                session_id.clone(),
                                acp1::ToolCallUpdate::new(
                                    "tool-1",
                                    acp1::ToolCallUpdateFields::new()
                                        .title("Run tests")
                                        .status(acp1::ToolCallStatus::Pending),
                                ),
                                options,
                            );
                            notify
                                .send_request(request)
                                .block_task()
                                .await
                                .map_err(Error::into_internal_error)?;
                        }
                        let (message_id, ordinal) = {
                            let mut state = state.lock();
                            state.next_message += 1;
                            (
                                format!("mock-v1-message-{}", state.next_message),
                                state.next_message,
                            )
                        };
                        let text = format!("echo: {prompt}");
                        for chunk in text.split(' ') {
                            let content = acp1::ContentChunk::new(acp1::ContentBlock::Text(
                                acp1::TextContent::new(format!("{chunk} ")),
                            ));
                            let content = if ordinal % 2 == 0 {
                                content.message_id(acp1::MessageId::new(message_id.clone()))
                            } else {
                                content
                            };
                            let update = acp1::SessionUpdate::AgentMessageChunk(content);
                            state
                                .lock()
                                .history
                                .entry(session_id.clone())
                                .or_default()
                                .push(update.clone());
                            notify
                                .send_notification(acp1::SessionNotification::new(
                                    session_id.clone(),
                                    update,
                                ))
                                .map_err(Error::into_internal_error)?;
                        }
                        responder.respond(acp1::PromptResponse::new(acp1::StopReason::EndTurn))
                    })?;
                    Ok(())
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_notification(
            async |_notification: acp1::CancelNotification, _connection| Ok(()),
            agent_client_protocol::on_receive_notification!(),
        )
        .connect_to(transport)
        .await
}

fn prompt_text_v1(blocks: &[acp1::ContentBlock]) -> String {
    blocks
        .iter()
        .filter_map(|block| match block {
            acp1::ContentBlock::Text(text) => Some(text.text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// The M1.6c U13 contract fixtures: one tool call per kind, a `diff` content,
/// a `usage_update` with a context size, and config options with categories.
/// Sent when a prompt contains `contract`.
pub fn contract_fixture_updates() -> Vec<acp1::SessionUpdate> {
    use acp1::ToolKind as Kind;

    let kinds = [
        Kind::Read,
        Kind::Edit,
        Kind::Delete,
        Kind::Move,
        Kind::Search,
        Kind::Execute,
        Kind::Think,
        Kind::Fetch,
        Kind::SwitchMode,
        Kind::Other,
    ];

    let mut updates: Vec<acp1::SessionUpdate> = kinds
        .into_iter()
        .enumerate()
        .map(|(index, kind)| {
            acp1::SessionUpdate::ToolCall(
                acp1::ToolCall::new(format!("contract-tool-{index}"), format!("Contract {kind:?}"))
                    .kind(kind)
                    .status(acp1::ToolCallStatus::Completed),
            )
        })
        .collect();

    updates.push(acp1::SessionUpdate::ToolCall(
        acp1::ToolCall::new("contract-diff", "Edit contract.txt")
            .kind(Kind::Edit)
            .content(vec![acp1::ToolCallContent::Diff(
                acp1::Diff::new("/tmp/contract.txt", "line two\n")
                    .old_text("line one\n"),
            )]),
    ));

    updates.push(acp1::SessionUpdate::UsageUpdate(
        acp1::UsageUpdate::new(1_200, 200_000).cost(acp1::Cost::new(0.42, "USD")),
    ));

    let select = |id: &'static str, name: &'static str, category: acp1::SessionConfigOptionCategory| {
        acp1::SessionConfigOption::select(
            id,
            name,
            "medium",
            vec![
                acp1::SessionConfigSelectOption::new("low", "Low")
                    .description("Fastest"),
                acp1::SessionConfigSelectOption::new("medium", "Medium"),
            ],
        )
        .category(category)
    };
    updates.push(acp1::SessionUpdate::ConfigOptionUpdate(
        acp1::ConfigOptionUpdate::new(vec![
            select(
                "thought_level",
                "Effort",
                acp1::SessionConfigOptionCategory::ThoughtLevel,
            ),
            select("model", "Model", acp1::SessionConfigOptionCategory::Model),
        ]),
    ));

    updates
}
#[cfg(feature = "acp-v2")]
mod v2 {
    use super::*;
    use agent_client_protocol::schema::v2 as acp2;
    use agent_client_protocol::V2ConnectionTo;
    #[derive(Default)]
    struct MockStateV2 {
        next_session: u32,
        next_message: u32,
        history: HashMap<String, Vec<acp2::SessionUpdate>>,
    }
    pub async fn run() -> Result<()> {
        serve(Stdio::new()).await
    }
    pub async fn serve(transport: impl agent_client_protocol::ConnectTo<Agent>) -> Result<()> {
        let state = Arc::new(Mutex::new(MockStateV2::default()));
        Agent
            .v2()
            .name("tethys-mock-v2")
            .on_receive_request(
                async |request: acp2::InitializeRequest,
                       responder: Responder<acp2::InitializeResponse>,
                       _connection: V2ConnectionTo<agent_client_protocol::Client>| {
                    responder.respond(
                        acp2::InitializeResponse::new(
                            request.protocol_version,
                            acp2::Implementation::new("tethys-mock", "0.0.0"),
                        )
                        .capabilities(
                            acp2::AgentCapabilities::new()
                                .session(acp2::SessionCapabilities::new()),
                        ),
                    )
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                {
                    let state = state.clone();
                    async move |_request: acp2::NewSessionRequest,
                                responder: Responder<acp2::NewSessionResponse>,
                                connection: V2ConnectionTo<agent_client_protocol::Client>| {
                        let mut state = state.lock();
                        state.next_session += 1;
                        let session_id = acp2::SessionId::new(format!(
                            "mock-v2-session-{}",
                            state.next_session
                        ));
                        state.history.insert(session_id.to_string(), Vec::new());
                        let history_key = session_id.clone();
                        drop(state);
                        responder.respond(acp2::NewSessionResponse::new(session_id.clone()))?;
                        connection.send_notification(acp2::UpdateSessionNotification::new(
                            history_key,
                            acp2::SessionUpdate::StateUpdate(acp2::StateUpdate::Idle(
                                acp2::IdleStateUpdate::new(),
                            )),
                        ))
                    }
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                {
                    let state = state.clone();
                    async move |request: acp2::ResumeSessionRequest,
                                responder: Responder<acp2::ResumeSessionResponse>,
                                connection: V2ConnectionTo<agent_client_protocol::Client>| {
                        let session_id = request.session_id.to_string();
                        let replay = matches!(request.replay_from, Some(acp2::ReplayFrom::Start(_)));
                        let history = if replay {
                            state
                                .lock()
                                .history
                                .get(&session_id)
                                .cloned()
                                .unwrap_or_default()
                        } else {
                            Vec::new()
                        };
                        for update in history {
                            connection
                                .send_notification(acp2::UpdateSessionNotification::new(
                                    request.session_id.clone(),
                                    update,
                                ))
                                .map_err(Error::into_internal_error)?;
                        }
                        responder.respond(acp2::ResumeSessionResponse::new())
                    }
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                async |request: acp2::CloseSessionRequest,
                       responder: Responder<acp2::CloseSessionResponse>,
                       _connection: V2ConnectionTo<agent_client_protocol::Client>| {
                    let _ = request;
                    responder.respond(acp2::CloseSessionResponse::new())
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                {
                    let state = state.clone();
                    async move |request: acp2::PromptRequest,
                                responder: Responder<acp2::PromptResponse>,
                                connection: V2ConnectionTo<agent_client_protocol::Client>| {
                        let session_id = request.session_id.clone();
                        let prompt = prompt_text_v2(&request.prompt);
                        responder.respond(acp2::PromptResponse::new())?;
                        let state = state.clone();
                        let notify = connection.clone();
                        connection.spawn(async move {
                            send_to(
                                &notify,
                                &session_id,
                                acp2::SessionUpdate::StateUpdate(acp2::StateUpdate::Running(
                                    acp2::RunningStateUpdate::new(),
                                )),
                            )?;
                            if prompt.contains("slow") {
                                tokio::time::sleep(std::time::Duration::from_millis(750)).await;
                            }
                            if prompt.contains("permission") {
                                let options = vec![
                                    acp2::PermissionOption::new(
                                        "allow",
                                        "Allow",
                                        acp2::PermissionOptionKind::AllowOnce,
                                    ),
                                    acp2::PermissionOption::new(
                                        "deny",
                                        "Deny",
                                        acp2::PermissionOptionKind::RejectOnce,
                                    ),
                                ];
                                let request = acp2::RequestPermissionRequest::new(
                                    session_id.clone(),
                                    "Run tests",
                                    options,
                                );
                                notify
                                    .send_request(request)
                                    .block_task()
                                    .await
                                    .map_err(Error::into_internal_error)?;
                            }
                            let message_id = {
                                let mut state = state.lock();
                                state.next_message += 1;
                                acp2::MessageId::new(format!(
                                    "mock-v2-message-{}",
                                    state.next_message
                                ))
                            };
                            let text = format!("echo: {prompt}");
                            for chunk in text.split(' ') {
                                let update = acp2::SessionUpdate::AgentMessageChunk(
                                    acp2::ContentChunk::new(
                                        text_block_v2(format!("{chunk} ")),
                                        message_id.clone(),
                                    ),
                                );
                                state
                                    .lock()
                                    .history
                                    .entry(session_id.to_string())
                                    .or_default()
                                    .push(update.clone());
                                send_to(&notify, &session_id, update)?;
                            }
                            send_to(
                                &notify,
                                &session_id,
                                acp2::SessionUpdate::StateUpdate(acp2::StateUpdate::Idle(
                                    acp2::IdleStateUpdate::new()
                                        .stop_reason(acp2::StopReason::EndTurn),
                                )),
                            )
                        })?;
                        Ok(())
                    }
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_notification(
                async |_notification: acp2::CancelSessionNotification,
                       _connection: V2ConnectionTo<agent_client_protocol::Client>| { Ok(()) },
                agent_client_protocol::on_receive_notification!(),
            )
            .connect_to(transport)
            .await
    }

    fn send_to(
        connection: &V2ConnectionTo<agent_client_protocol::Client>,
        session_id: &acp2::SessionId,
        update: acp2::SessionUpdate,
    ) -> Result<()> {
        connection
            .send_notification(acp2::UpdateSessionNotification::new(
                session_id.clone(),
                update,
            ))
            .map_err(Error::into_internal_error)
    }

    fn text_block_v2(text: String) -> acp2::ContentBlock {
        acp2::ContentBlock::Text(acp2::TextContent::new(text))
    }

    fn prompt_text_v2(blocks: &[acp2::ContentBlock]) -> String {
        blocks
            .iter()
            .filter_map(|block| match block {
                acp2::ContentBlock::Text(text) => Some(text.text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join(" ")
    }
}
#[cfg(feature = "acp-v2")]
async fn run_v2() -> Result<()> {
    v2::run().await
}
#[cfg(feature = "acp-v2")]
pub async fn serve_v2(transport: impl agent_client_protocol::ConnectTo<Agent>) -> Result<()> {
    v2::serve(transport).await
}
