use super::inbound::merge_session_update_meta;
use super::provider_control::provider_routes_from_value;
use super::wire::*;
use super::*;
use serde_json::json;

#[test]
fn auth_method_view_carries_id_name_description_and_shape() {
    let view = auth_method_view(
        "tui-auth",
        "Terminal Auth",
        Some("run in a terminal"),
        AuthMethodShape::CliPassthrough,
        None,
    );
    assert_eq!(view.id, "tui-auth");
    assert_eq!(view.name, "Terminal Auth");
    assert_eq!(view.description.as_deref(), Some("run in a terminal"));
    assert_eq!(view.shape, AuthMethodShape::CliPassthrough);
}

#[test]
fn unknown_auth_shape_names_the_method_id() {
    let view = auth_method_view(
        "future-auth",
        "Future",
        None,
        AuthMethodShape::Unknown {
            id: "future-auth".into(),
        },
        None,
    );
    assert_eq!(
        view.shape,
        AuthMethodShape::Unknown {
            id: "future-auth".into()
        }
    );
}

#[test]
fn normalizes_provider_route_responses_without_returning_headers() {
    let routes = provider_routes_from_value(json!([{
        "providerId": "primary",
        "supported": ["openai", "_custom"],
        "required": true,
        "current": {
            "apiType": "openai",
            "baseUrl": "https://api.example.com/v1",
            "_meta": {"region": "test"}
        },
        "_meta": {"label": "Primary"}
    }]))
    .expect("valid route list");
    assert_eq!(routes[0].provider_id, "primary");
    assert_eq!(routes[0].supported, ["openai", "_custom"]);
    assert!(routes[0].required);
    assert_eq!(
        routes[0]
            .current
            .as_ref()
            .map(|route| route.base_url.as_str()),
        Some("https://api.example.com/v1")
    );
    assert!(provider_routes_from_value(json!([{}])).is_err());
}

#[test]
fn async_and_native_subagent_controls_require_bilateral_negotiation() {
    struct TestPermissionResolver;

    #[async_trait]
    impl PermissionResolver for TestPermissionResolver {
        async fn resolve(
            &self,
            _session: &SessionId,
            _request: PermissionRequested,
        ) -> PermissionDecision {
            PermissionDecision {
                outcome: PermOutcome::Approved,
                option_id: None,
                decided_by: tethys_schema::thread::Decider::Policy,
            }
        }
    }

    let mut options = AcpConnectOptions::new(AcpProtocol::V1, Arc::new(TestPermissionResolver));
    options.integration = Some(AcpProviderIntegration {
        id: "codex-acp".into(),
        initialize_meta: Default::default(),
        client_capabilities_meta: serde_json::from_value(json!({
            "jetbrains": {"air": {"capabilities": [
                "asyncTasks", "nativeSubagentSessions"
            ]}}
        }))
        .expect("client meta"),
        gateway_auth: false,
        extension_methods: vec!["_session/async_task/stop".into()],
        tethys_commands: Default::default(),
        extension_request_handler: None,
        extension_notification_handler: None,
        session_update_handler: None,
        config_options_handler: None,
        permission_metadata_handler: None,
        prompt_response_handler: None,
        prompt_metadata_handler: None,
    });
    let shared = Shared::new(&options);
    let agent_meta = serde_json::from_value(json!({
        "jetbrains": {"air": {"capabilities": [
            "asyncTasks", "nativeSubagentSessions"
        ]}}
    }))
    .expect("agent meta");
    let capabilities = shared.provider_extension_capabilities(Some(&agent_meta), false, false);
    assert!(capabilities.async_tasks);
    assert!(capabilities.native_subagents);

    let agent_meta = serde_json::from_value(json!({
        "jetbrains": {"air": {"capabilities": ["asyncTasks"]}}
    }))
    .expect("agent meta without subagents");
    let capabilities = shared.provider_extension_capabilities(Some(&agent_meta), false, false);
    assert!(capabilities.async_tasks);
    assert!(!capabilities.native_subagents);
}

fn session_servers() -> Vec<serde_json::Value> {
    vec![
        json!({
            "name": "github",
            "transport": "stdio",
            "command": "github-mcp-server",
            "args": ["stdio"],
            "env": { "GITHUB_TOKEN": "resolved-secret" }
        }),
        json!({
            "name": "linear",
            "transport": "http",
            "url": "https://mcp.linear.app/mcp",
            "headers": { "Authorization": "Bearer resolved-secret" }
        }),
        json!({
            "name": "legacy",
            "transport": "sse",
            "url": "https://legacy.example.com/sse"
        }),
    ]
}

#[test]
fn v1_maps_stdio_http_and_sse_by_capability() {
    let all = McpTransports {
        stdio: true,
        http: true,
        sse: true,
    };
    let mapped = serde_json::to_value(v1_mcp_servers(&session_servers(), &all)).expect("json");
    assert_eq!(mapped[0]["command"], "github-mcp-server");
    assert_eq!(mapped[0]["env"][0]["name"], "GITHUB_TOKEN");
    assert_eq!(mapped[1]["type"], "http");
    assert_eq!(mapped[1]["headers"][0]["value"], "Bearer resolved-secret");
    assert_eq!(mapped[2]["type"], "sse");

    let stdio_only = McpTransports {
        stdio: true,
        http: false,
        sse: false,
    };
    let mapped = v1_mcp_servers(&session_servers(), &stdio_only);
    assert_eq!(mapped.len(), 1);
}

#[test]
fn raw_session_notification_preserves_unknown_update_variants() {
    let raw = json!({
        "sessionId": "parent",
        "update": {
            "sessionUpdate": "subagent_spawned",
            "subagentSessionId": "child",
            "name": "Explore",
            "task": "Inspect the module",
            "_meta": {"claudeCode": {"parentToolUseId": "tool-1"}},
            "capabilities": {}
        },
        "_meta": {"goal": {"objective": "Inspect"}}
    });
    let notification: RawSessionNotification =
        serde_json::from_value(raw).expect("raw notification");
    assert_eq!(notification.session_id, "parent");
    assert_eq!(notification.update["sessionUpdate"], "subagent_spawned");
    assert!(serde_json::from_value::<acp1::SessionUpdate>(notification.update.clone()).is_err());
    let merged = merge_session_update_meta(notification.update, notification.meta);
    assert_eq!(merged["_meta"]["goal"]["objective"], "Inspect");
    assert_eq!(merged["_meta"]["claudeCode"]["parentToolUseId"], "tool-1");
}

#[test]
fn marks_provider_commands_handled_by_tethys() {
    struct TestPermissionResolver;

    #[async_trait]
    impl PermissionResolver for TestPermissionResolver {
        async fn resolve(
            &self,
            _session: &SessionId,
            _request: PermissionRequested,
        ) -> PermissionDecision {
            PermissionDecision {
                outcome: PermOutcome::Approved,
                option_id: None,
                decided_by: tethys_schema::thread::Decider::Policy,
            }
        }
    }

    let mut options = AcpConnectOptions::new(AcpProtocol::V1, Arc::new(TestPermissionResolver));
    options.integration = Some(AcpProviderIntegration {
        id: "fixture".into(),
        initialize_meta: Default::default(),
        client_capabilities_meta: Default::default(),
        gateway_auth: false,
        extension_methods: vec![],
        tethys_commands: HashMap::from([("model".into(), AgentCommandControl::Model)]),
        extension_request_handler: None,
        extension_notification_handler: None,
        session_update_handler: None,
        config_options_handler: None,
        permission_metadata_handler: None,
        prompt_response_handler: None,
        prompt_metadata_handler: None,
    });
    let shared = Shared::new(&options);
    let mut events = vec![TurnEventBody::CommandsAvailable {
        commands: vec![tethys_schema::thread::AgentCommand {
            name: "model".into(),
            description: Some("Provider model command".into()),
            input: None,
            tethys_control: None,
        }],
    }];

    shared.process_session_update("thread", &json!({}), &mut events);

    assert!(matches!(
        &events[0],
        TurnEventBody::CommandsAvailable { commands }
            if commands[0].tethys_control == Some(AgentCommandControl::Model)
    ));
}

#[test]
fn routes_subagent_updates_into_the_root_transcript() {
    use tethys_schema::thread::{MessageChunk, ToolCallPatch, ToolCallStatus, ToolOrigin};

    struct TestPermissionResolver;

    #[async_trait]
    impl PermissionResolver for TestPermissionResolver {
        async fn resolve(
            &self,
            _session: &SessionId,
            _request: PermissionRequested,
        ) -> PermissionDecision {
            PermissionDecision {
                outcome: PermOutcome::Approved,
                option_id: None,
                decided_by: tethys_schema::thread::Decider::Policy,
            }
        }
    }

    let mut options = AcpConnectOptions::new(AcpProtocol::V1, Arc::new(TestPermissionResolver));
    options.integration = Some(AcpProviderIntegration {
        id: "fixture".into(),
        initialize_meta: Default::default(),
        client_capabilities_meta: Default::default(),
        gateway_auth: false,
        extension_methods: vec![],
        tethys_commands: Default::default(),
        extension_request_handler: None,
        extension_notification_handler: None,
        session_update_handler: Some(Arc::new(|_session_id, _request_id, raw, events| {
            if raw["sessionUpdate"] == "subagent_spawned" {
                events.push(TurnEventBody::ToolCallUpsert {
                    tool_call_id: "child".into(),
                    patch: ToolCallPatch {
                        origin: Some(ToolOrigin::Subagent),
                        status: Some(ToolCallStatus::Executing),
                        ..Default::default()
                    },
                });
                Some("child".into())
            } else {
                None
            }
        })),
        config_options_handler: None,
        permission_metadata_handler: None,
        prompt_response_handler: None,
        prompt_metadata_handler: None,
    });
    let shared = Shared::new(&options);

    let mut spawned = Vec::new();
    let root = shared.process_session_update(
        "root",
        &json!({"sessionUpdate": "subagent_spawned"}),
        &mut spawned,
    );
    assert_eq!(root, "root");
    assert_eq!(shared.root_session_id("child"), "root");

    let mut child_events = vec![
        TurnEventBody::MessageChunk(MessageChunk {
            message_id: "m1".into(),
            role: Role::Agent,
            block: ContentBlock::Text("Found the module.".into()),
        }),
        TurnEventBody::ToolCallUpsert {
            tool_call_id: "child-tool".into(),
            patch: ToolCallPatch::default(),
        },
    ];
    let root = shared.process_session_update("child", &json!({}), &mut child_events);
    assert_eq!(root, "root");
    assert!(matches!(
        &child_events[0],
        TurnEventBody::ToolCallContentChunk { tool_call_id, item }
            if tool_call_id == "child" && item == &ToolCallContent::Text("Found the module.".into())
    ));
    assert!(matches!(
        &child_events[1],
        TurnEventBody::ToolCallUpsert { tool_call_id, patch }
            if tool_call_id == "child-tool"
                && patch.parent_tool_call_id.as_deref() == Some("child")
    ));
}

#[test]
fn prompt_blocks_follow_negotiated_content_capabilities() {
    let capabilities = NormalizedCapabilities {
        prompt_image: true,
        prompt_audio: true,
        prompt_embedded_context: true,
        ..Default::default()
    };

    let resource_link = to_v1_block(
        ContentBlock::ResourceLink {
            uri: "file:///tmp/a.txt".into(),
            name: "a.txt".into(),
            mime_type: Some("text/plain".into()),
            acp_metadata: None,
        },
        &capabilities,
    )
    .expect("resource link");
    assert!(matches!(resource_link, acp1::ContentBlock::ResourceLink(_)));

    for block in [
        ContentBlock::Image {
            mime_type: "image/png".into(),
            data: "aW1hZ2U=".into(),
            acp_metadata: None,
        },
        ContentBlock::Audio {
            mime_type: "audio/wav".into(),
            data: "YXVkaW8=".into(),
            acp_metadata: None,
        },
        ContentBlock::Resource {
            uri: "urn:text".into(),
            mime_type: Some("text/plain".into()),
            text: Some("embedded".into()),
            blob: None,
            acp_metadata: None,
        },
    ] {
        to_v1_block(block, &capabilities).expect("negotiated block");
    }

    let image_unsupported = NormalizedCapabilities {
        prompt_image: false,
        ..capabilities
    };
    let error = to_v1_block(
        ContentBlock::Image {
            mime_type: "image/png".into(),
            data: "aW1hZ2U=".into(),
            acp_metadata: None,
        },
        &image_unsupported,
    )
    .expect_err("image must be gated");
    assert!(matches!(
        error,
        ConnectionError::Unsupported("prompt_image")
    ));
}

#[cfg(feature = "acp-v2")]
#[test]
fn v2_maps_stdio_and_http_only() {
    let all = McpTransports {
        stdio: true,
        http: true,
        sse: true,
    };
    let mapped = serde_json::to_value(v2_mcp_servers(&session_servers(), &all)).expect("json");
    assert_eq!(mapped.as_array().expect("array").len(), 2);
    assert_eq!(mapped[0]["type"], "stdio");
    assert_eq!(mapped[0]["command"], "github-mcp-server");
    assert_eq!(mapped[1]["type"], "http");

    let http_only = McpTransports {
        stdio: false,
        http: true,
        sse: false,
    };
    let mapped = v2_mcp_servers(&session_servers(), &http_only);
    assert_eq!(mapped.len(), 1);
}

#[test]
fn unresolved_secret_refs_are_never_sent() {
    let values = vec![json!({
        "name": "github",
        "transport": "stdio",
        "command": "github-mcp-server",
        "env": { "GITHUB_TOKEN": { "secretRef": "keychain:tethys/github" } }
    })];
    let mapped =
        serde_json::to_value(v1_mcp_servers(&values, &McpTransports::all())).expect("json");
    assert!(mapped[0]["env"].as_array().expect("env array").is_empty());
}

#[test]
fn a_chosen_reject_option_reaches_the_agent_as_selected() {
    let decision = |outcome, option_id: Option<&str>| PermissionDecision {
        outcome,
        option_id: option_id.map(str::to_owned),
        decided_by: tethys_schema::thread::Decider::User,
    };
    let rejected = serde_json::to_value(v1_permission_response(decision(
        PermOutcome::Rejected,
        Some("reject-once"),
    )))
    .expect("json");
    assert_eq!(rejected["outcome"]["outcome"], "selected");
    assert_eq!(rejected["outcome"]["optionId"], "reject-once");

    let cancelled = serde_json::to_value(v1_permission_response(decision(
        PermOutcome::Rejected,
        None,
    )))
    .expect("json");
    assert_eq!(cancelled["outcome"]["outcome"], "cancelled");
}

/// A Provider with no integration at all still gets the todo surface and plan
/// from a plain tool call: the shared mapper infers them from the input.
#[test]
fn a_provider_without_a_hook_gets_todo_and_question_surfaces() {
    struct TestPermissionResolver;

    #[async_trait]
    impl PermissionResolver for TestPermissionResolver {
        async fn resolve(
            &self,
            _session: &SessionId,
            _request: PermissionRequested,
        ) -> PermissionDecision {
            PermissionDecision {
                outcome: PermOutcome::Cancelled,
                option_id: None,
                decided_by: tethys_schema::thread::Decider::Policy,
            }
        }
    }

    let options = AcpConnectOptions::new(AcpProtocol::V1, Arc::new(TestPermissionResolver));
    let shared = Shared::new(&options);
    let call = |id: &str, input: serde_json::Value| TurnEventBody::ToolCallUpsert {
        tool_call_id: id.into(),
        patch: tethys_schema::thread::ToolCallPatch {
            input: Some(input.to_string()),
            ..Default::default()
        },
    };
    let mut events = vec![
        call(
            "todo",
            json!({"todos": [{"content": "Ship", "status": "pending"}]}),
        ),
        call("ask", json!({"questions": [{"question": "Which?"}]})),
    ];

    shared.process_session_update("thread", &json!({}), &mut events);

    let surfaces: Vec<_> = events
        .iter()
        .filter_map(|event| match event {
            TurnEventBody::ToolCallUpsert { patch, .. } => patch.surface,
            _ => None,
        })
        .collect();
    assert_eq!(
        surfaces,
        [
            tethys_schema::thread::ToolSurface::Todo,
            tethys_schema::thread::ToolSurface::Question
        ]
    );
    assert!(events.iter().any(
        |event| matches!(event, TurnEventBody::PlanUpsert { plan, .. } if plan.entries.len() == 1)
    ));
}
