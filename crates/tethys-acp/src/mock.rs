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

/// Marker a test binary sets on itself the first time it reaches
/// [`run_if_requested`] as a harness. Children inherit it, so a child that
/// reaches the same call *without* [`MOCK_ENV`] is a test binary re-executed by
/// mistake, which would otherwise re-run the suite and spawn itself forever.
pub const HARNESS_ENV: &str = "TETHYS_TEST_HARNESS";

/// Exit code for an accidental harness re-exec (see [`HARNESS_ENV`]).
pub const REEXEC_EXIT_CODE: i32 = 97;

/// Runs the requested mock agent (blocking). Returns `false` when this process
/// is not a mock agent.
///
/// A process that is neither a mock agent nor the first harness process exits
/// with [`REEXEC_EXIT_CODE`] rather than running the test suite again.
pub fn run_if_requested() -> bool {
    let Ok(kind) = std::env::var(MOCK_ENV) else {
        if std::env::var_os(HARNESS_ENV).is_some() {
            eprintln!(
                "test binary re-executed as a child without {MOCK_ENV} set; \
                 set {MOCK_ENV}=v1|v2 on the launch spec (refusing to re-run the suite)"
            );
            std::process::exit(REEXEC_EXIT_CODE);
        }
        std::env::set_var(HARNESS_ENV, "1");
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
    mode: Option<String>,
    config_value: Option<String>,
    additional: Vec<std::path::PathBuf>,
}

/// Modes the v1 mock advertises at `session/new`.
fn mock_modes_v1() -> acp1::SessionModeState {
    acp1::SessionModeState::new(
        "default",
        vec![
            acp1::SessionMode::new("default", "Default"),
            acp1::SessionMode::new("plan", "Plan"),
            acp1::SessionMode::new("accept-edits", "Accept Edits"),
        ],
    )
}

/// Config options the v1 mock advertises at `session/new`.
fn mock_config_options_v1(current: Option<&str>) -> Vec<acp1::SessionConfigOption> {
    let current = current.unwrap_or("medium").to_string();
    vec![acp1::SessionConfigOption::select(
        "thought_level",
        "Effort",
        current,
        vec![
            acp1::SessionConfigSelectOption::new("low", "Low"),
            acp1::SessionConfigSelectOption::new("medium", "Medium"),
            acp1::SessionConfigSelectOption::new("high", "High"),
        ],
    )]
}

/// Runs the v1 mock agent over stdio.
pub async fn run_v1() -> Result<()> {
    serve_v1(Stdio::new()).await
}

/// Auth methods the mock advertises when `TETHYS_MOCK_AUTH` is set
/// (`agent` → agent-auth, `terminal` → CLI passthrough).
fn mock_auth_methods_v1(mode: Option<&str>, terminal_enabled: bool) -> Vec<acp1::AuthMethod> {
    match mode {
        Some("agent") => vec![acp1::AuthMethod::Agent(acp1::AuthMethodAgent::new(
            "agent",
            "Agent Auth",
        ))],
        Some("terminal") if terminal_enabled => vec![acp1::AuthMethod::Terminal(
            acp1::AuthMethodTerminal::new("tui-auth", "Terminal Auth"),
        )],
        _ => Vec::new(),
    }
}

/// Serves the v1 mock agent over any agent-role transport.
pub async fn serve_v1(transport: impl agent_client_protocol::ConnectTo<Agent>) -> Result<()> {
    let auth_mode = std::env::var("TETHYS_MOCK_AUTH").ok();
    serve_v1_with_auth(transport, auth_mode.as_deref()).await
}

/// Serves the v1 mock with an explicit authentication declaration.
pub async fn serve_v1_with_auth(
    transport: impl agent_client_protocol::ConnectTo<Agent>,
    auth_mode: Option<&str>,
) -> Result<()> {
    let state = Arc::new(Mutex::new(MockStateV1::default()));
    let auth_mode = auth_mode.map(str::to_string);
    let require_auth = std::env::var("TETHYS_MOCK_REQUIRE_AUTH").ok();
    let load_sessions = std::env::var_os("TETHYS_MOCK_NO_LOAD").is_none();
    Agent
        .builder()
        .name("tethys-mock-v1")
        .on_receive_request(
            async move |request: acp1::InitializeRequest,
                        responder: Responder<acp1::InitializeResponse>,
                        _connection| {
                let auth_methods = mock_auth_methods_v1(
                    auth_mode.as_deref(),
                    request.client_capabilities.auth.terminal,
                );
                let mut capabilities = acp1::AgentCapabilities::new()
                    .load_session(load_sessions)
                    .providers(acp1::ProvidersCapabilities::new())
                    .session_capabilities(
                        acp1::SessionCapabilities::new()
                            .list(acp1::SessionListCapabilities::new())
                            .delete(acp1::SessionDeleteCapabilities::new()),
                    );
                if !auth_methods.is_empty() {
                    capabilities = capabilities.auth(
                        acp1::AgentAuthCapabilities::new().logout(acp1::LogoutCapabilities::new()),
                    );
                }
                responder.respond(
                    acp1::InitializeResponse::new(request.protocol_version)
                        .agent_info(acp1::Implementation::new("tethys-mock-v1", "0.0.0"))
                        .agent_capabilities(capabilities)
                        .auth_methods(auth_methods),
                )
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async |_request: acp1::ListProvidersRequest,
                   responder: Responder<acp1::ListProvidersResponse>,
                   _connection| {
                responder.respond(acp1::ListProvidersResponse::new(vec![
                    acp1::ProviderInfo::new(
                        "primary",
                        vec![acp1::LlmProtocol::OpenAi],
                        true,
                        Some(acp1::ProviderCurrentConfig::new(
                            acp1::LlmProtocol::OpenAi,
                            "https://api.example.test/v1",
                        )),
                    ),
                    acp1::ProviderInfo::new(
                        "alternate",
                        vec![acp1::LlmProtocol::OpenAi],
                        false,
                        Some(acp1::ProviderCurrentConfig::new(
                            acp1::LlmProtocol::OpenAi,
                            "https://alternate.example.test/v1",
                        )),
                    ),
                ]))
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async |_request: acp1::SetProviderRequest,
                   responder: Responder<acp1::SetProviderResponse>,
                   _connection| { responder.respond(acp1::SetProviderResponse::new()) },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async |_request: acp1::DisableProviderRequest,
                   responder: Responder<acp1::DisableProviderResponse>,
                   _connection| {
                responder.respond(acp1::DisableProviderResponse::new())
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async |_request: acp1::AuthenticateRequest,
                   responder: Responder<acp1::AuthenticateResponse>,
                   _connection| {
                responder.respond(acp1::AuthenticateResponse::new())
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async |_request: acp1::LogoutRequest,
                   responder: Responder<acp1::LogoutResponse>,
                   _connection| { responder.respond(acp1::LogoutResponse::new()) },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            {
                async move |request: acp1::ListSessionsRequest,
                            responder: Responder<acp1::ListSessionsResponse>,
                            _connection| {
                    // Three sessions, two pages: exercises cursor in/out.
                    let cwd = request.cwd.clone().unwrap_or_default();
                    let sessions = (1..=3)
                        .map(|index| {
                            acp1::SessionInfo::new(
                                format!("mock-listed-{index}"),
                                cwd.join(format!("session-{index}")),
                            )
                            .title(format!("Listed {index}"))
                        })
                        .collect::<Vec<_>>();
                    let (page, next) = match request.cursor.as_deref() {
                        None => (sessions[..2].to_vec(), Some("page-2".to_string())),
                        Some("page-2") => (sessions[2..].to_vec(), None),
                        Some(_) => (Vec::new(), None),
                    };
                    responder.respond(acp1::ListSessionsResponse::new(page).next_cursor(next))
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            {
                let state = state.clone();
                let require_auth = require_auth.clone();
                async move |request: acp1::NewSessionRequest,
                            responder: Responder<acp1::NewSessionResponse>,
                            _connection| {
                    if require_auth.as_deref() == Some("new") {
                        return responder.respond_with_error(Error::auth_required());
                    }
                    let mut state = state.lock();
                    state.additional = request.additional_directories.clone();
                    state.next_session += 1;
                    let session_id = format!(
                        "mock-v1-session-{}-{}",
                        std::process::id(),
                        state.next_session
                    );
                    state.history.insert(session_id.clone(), Vec::new());
                    responder.respond(
                        acp1::NewSessionResponse::new(session_id)
                            .modes(mock_modes_v1())
                            .config_options(mock_config_options_v1(None)),
                    )
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
                        responder.respond(
                            acp1::LoadSessionResponse::new()
                                .modes(mock_modes_v1())
                                .config_options(mock_config_options_v1(None)),
                        )
                    })?;
                    Ok(())
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            {
                let state = state.clone();
                async move |request: acp1::SetSessionModeRequest,
                            responder: Responder<acp1::SetSessionModeResponse>,
                            connection: agent_client_protocol::ConnectionTo<
                    agent_client_protocol::Client,
                >| {
                    let session_id = request.session_id.to_string();
                    let mode_id = request.mode_id.to_string();
                    state.lock().mode = Some(mode_id.clone());
                    let notify = connection.clone();
                    connection.spawn(async move {
                        notify
                            .send_notification(acp1::SessionNotification::new(
                                session_id.clone(),
                                acp1::SessionUpdate::CurrentModeUpdate(
                                    acp1::CurrentModeUpdate::new(mode_id),
                                ),
                            ))
                            .map_err(Error::into_internal_error)?;
                        responder.respond(acp1::SetSessionModeResponse::new())
                    })?;
                    Ok(())
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            {
                let state = state.clone();
                async move |request: acp1::SetSessionConfigOptionRequest,
                            responder: Responder<acp1::SetSessionConfigOptionResponse>,
                            connection: agent_client_protocol::ConnectionTo<
                    agent_client_protocol::Client,
                >| {
                    let session_id = request.session_id.to_string();
                    let value = match request.value {
                        acp1::SessionConfigOptionValue::ValueId { value } => value.to_string(),
                        acp1::SessionConfigOptionValue::Boolean { value } => value.to_string(),
                        _ => "medium".to_string(),
                    };
                    state.lock().config_value = Some(value.clone());
                    let options = mock_config_options_v1(Some(&value));
                    let notify = connection.clone();
                    connection.spawn(async move {
                        notify
                            .send_notification(acp1::SessionNotification::new(
                                session_id.clone(),
                                acp1::SessionUpdate::ConfigOptionUpdate(
                                    acp1::ConfigOptionUpdate::new(options.clone()),
                                ),
                            ))
                            .map_err(Error::into_internal_error)?;
                        responder.respond(acp1::SetSessionConfigOptionResponse::new(options))
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
                        if prompt.contains("extension") {
                            let params = Arc::from(
                                serde_json::value::RawValue::from_string(
                                    serde_json::json!({ "sessionId": session_id }).to_string(),
                                )
                                .map_err(Error::into_internal_error)?,
                            );
                            let response = notify
                                .send_request(acp1::AgentRequest::ExtMethodRequest(
                                    acp1::ExtRequest::new("_fixture.dev/action", params),
                                ))
                                .block_task()
                                .await
                                .map_err(Error::into_internal_error)?;
                            let update = acp1::SessionUpdate::AgentMessageChunk(
                                acp1::ContentChunk::new(acp1::ContentBlock::Text(
                                    acp1::TextContent::new(response.to_string()),
                                )),
                            );
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
                            responder
                                .respond(acp1::PromptResponse::new(acp1::StopReason::EndTurn))?;
                            return Ok(());
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
                        if prompt.contains("fs/read") {
                            let path = {
                                let state = state.lock();
                                if prompt.contains("escape") {
                                    std::path::PathBuf::from("/etc/passwd")
                                } else {
                                    state
                                        .additional
                                        .first()
                                        .cloned()
                                        .unwrap_or_else(|| std::path::PathBuf::from("."))
                                        .join("probe.txt")
                                }
                            };
                            let response = notify
                                .send_request(acp1::ReadTextFileRequest::new(
                                    session_id.clone(),
                                    path,
                                ))
                                .block_task()
                                .await;
                            let text = match response {
                                Ok(response) => format!("probe:{}", response.content),
                                Err(_) => "fs-error".to_string(),
                            };
                            let update =
                                acp1::SessionUpdate::AgentMessageChunk(acp1::ContentChunk::new(
                                    acp1::ContentBlock::Text(acp1::TextContent::new(text)),
                                ));
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
                            responder
                                .respond(acp1::PromptResponse::new(acp1::StopReason::EndTurn))?;
                            return Ok(());
                        }
                        if prompt.contains("elicit-form") {
                            notify
                                .send_request(acp1::CreateElicitationRequest::new(
                                    acp1::ElicitationFormMode::new(
                                        acp1::ElicitationSessionScope::new(session_id.clone()),
                                        acp1::ElicitationSchema::new().string("name", true),
                                    ),
                                    "Choose a name",
                                ))
                                .block_task()
                                .await
                                .map_err(Error::into_internal_error)?;
                        }
                        if prompt.contains("elicit-url") {
                            notify
                                .send_request(acp1::CreateElicitationRequest::new(
                                    acp1::ElicitationUrlMode::new(
                                        acp1::ElicitationSessionScope::new(session_id.clone()),
                                        "mock-url",
                                        "https://example.test/authorize",
                                    ),
                                    "Authorize the mock agent",
                                ))
                                .block_task()
                                .await
                                .map_err(Error::into_internal_error)?;
                        }
                        if prompt.contains("terminal-lifecycle") {
                            let (shell, quick_args, long_args) = if cfg!(windows) {
                                (
                                    "cmd",
                                    vec!["/C".to_string(), "echo terminal-ok".to_string()],
                                    vec!["/C".to_string(), "ping -n 30 127.0.0.1 >NUL".to_string()],
                                )
                            } else {
                                (
                                    "sh",
                                    vec!["-c".to_string(), "printf terminal-ok".to_string()],
                                    vec!["-c".to_string(), "sleep 30".to_string()],
                                )
                            };
                            let quick = notify
                                .send_request(
                                    acp1::CreateTerminalRequest::new(session_id.clone(), shell)
                                        .args(quick_args),
                                )
                                .block_task()
                                .await
                                .map_err(Error::into_internal_error)?;
                            notify
                                .send_request(acp1::WaitForTerminalExitRequest::new(
                                    session_id.clone(),
                                    quick.terminal_id.clone(),
                                ))
                                .block_task()
                                .await
                                .map_err(Error::into_internal_error)?;
                            let output = notify
                                .send_request(acp1::TerminalOutputRequest::new(
                                    session_id.clone(),
                                    quick.terminal_id.clone(),
                                ))
                                .block_task()
                                .await
                                .map_err(Error::into_internal_error)?;
                            if !output.output.contains("terminal-ok") {
                                return Err(Error::internal_error());
                            }
                            notify
                                .send_request(acp1::ReleaseTerminalRequest::new(
                                    session_id.clone(),
                                    quick.terminal_id,
                                ))
                                .block_task()
                                .await
                                .map_err(Error::into_internal_error)?;

                            let long = notify
                                .send_request(
                                    acp1::CreateTerminalRequest::new(session_id.clone(), shell)
                                        .args(long_args),
                                )
                                .block_task()
                                .await
                                .map_err(Error::into_internal_error)?;
                            notify
                                .send_request(acp1::KillTerminalRequest::new(
                                    session_id.clone(),
                                    long.terminal_id.clone(),
                                ))
                                .block_task()
                                .await
                                .map_err(Error::into_internal_error)?;
                            notify
                                .send_request(acp1::ReleaseTerminalRequest::new(
                                    session_id.clone(),
                                    long.terminal_id,
                                ))
                                .block_task()
                                .await
                                .map_err(Error::into_internal_error)?;
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
                acp1::ToolCall::new(
                    format!("contract-tool-{index}"),
                    format!("Contract {kind:?}"),
                )
                .kind(kind)
                .status(acp1::ToolCallStatus::Completed),
            )
        })
        .collect();

    updates.push(acp1::SessionUpdate::ToolCall(
        acp1::ToolCall::new("contract-diff", "Edit contract.txt")
            .kind(Kind::Edit)
            .content(vec![acp1::ToolCallContent::Diff(
                acp1::Diff::new("/tmp/contract.txt", "line two\n").old_text("line one\n"),
            )]),
    ));

    updates.push(acp1::SessionUpdate::UsageUpdate(
        acp1::UsageUpdate::new(1_200, 200_000).cost(acp1::Cost::new(0.42, "USD")),
    ));

    let select =
        |id: &'static str, name: &'static str, category: acp1::SessionConfigOptionCategory| {
            acp1::SessionConfigOption::select(
                id,
                name,
                "medium",
                vec![
                    acp1::SessionConfigSelectOption::new("low", "Low").description("Fastest"),
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
                                .session(acp2::SessionCapabilities::new())
                                .providers(acp2::ProvidersCapabilities::new()),
                        ),
                    )
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                async |_request: acp2::ListProvidersRequest,
                       responder: Responder<acp2::ListProvidersResponse>,
                       _connection: V2ConnectionTo<agent_client_protocol::Client>| {
                    responder.respond(acp2::ListProvidersResponse::new(vec![
                        acp2::ProviderInfo::new(
                            "primary",
                            vec![acp2::LlmProtocol::OpenAi],
                            true,
                            Some(acp2::ProviderCurrentConfig::new(
                                acp2::LlmProtocol::OpenAi,
                                "https://api.example.test/v1",
                            )),
                        ),
                        acp2::ProviderInfo::new(
                            "alternate",
                            vec![acp2::LlmProtocol::OpenAi],
                            false,
                            Some(acp2::ProviderCurrentConfig::new(
                                acp2::LlmProtocol::OpenAi,
                                "https://alternate.example.test/v1",
                            )),
                        ),
                    ]))
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                async |_request: acp2::SetProviderRequest,
                       responder: Responder<acp2::SetProviderResponse>,
                       _connection: V2ConnectionTo<agent_client_protocol::Client>| {
                    responder.respond(acp2::SetProviderResponse::new())
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                async |_request: acp2::DisableProviderRequest,
                       responder: Responder<acp2::DisableProviderResponse>,
                       _connection: V2ConnectionTo<agent_client_protocol::Client>| {
                    responder.respond(acp2::DisableProviderResponse::new())
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
                            if prompt.contains("elicit-form") {
                                notify
                                    .send_request(acp2::CreateElicitationRequest::new(
                                        acp2::ElicitationFormMode::new(
                                            acp2::ElicitationSessionScope::new(session_id.clone()),
                                            acp2::ElicitationSchema::new().string("name", true),
                                        ),
                                        "Choose a name",
                                    ))
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
