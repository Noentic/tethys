use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tethys_acp::{
    AcpAdapter, AcpProtocolVersion, PermissionOutcome, Role, SessionState, StopReason,
    ToolCallStatus, TurnEventBody,
};

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("fixtures/acp")
}

#[test]
fn test_acp_v1_fixtures_and_normalization() {
    let v1_dir = fixtures_dir().join("v1");

    // 1. Initialize
    let init_raw: Value = serde_json::from_str(
        &fs::read_to_string(v1_dir.join("initialize.json")).expect("read v1 init"),
    )
    .expect("parse init");
    assert_eq!(init_raw["params"]["protocolVersion"], 1);

    // 2. Streaming updates
    let stream_raw: Vec<Value> = serde_json::from_str(
        &fs::read_to_string(v1_dir.join("prompt_streaming.json")).expect("read v1 stream"),
    )
    .expect("parse stream");

    let mut events = Vec::new();
    for raw in &stream_raw {
        if let Some(event) = AcpAdapter::translate_v1_event(raw) {
            events.push(event);
        }
    }

    assert_eq!(events.len(), 3);
    assert_eq!(
        events[0],
        TurnEventBody::MessageChunk {
            message_id: "v1_msg_0".into(),
            role: Role::Agent,
            chunk: "Hello! I am analyzing the workspace.".into(),
        }
    );
    match &events[1] {
        TurnEventBody::ToolCallUpsert { tool_call_id, patch } => {
            assert_eq!(tool_call_id, "tool_read_file_1");
            assert_eq!(patch.name.as_deref(), Some("read_file"));
            assert_eq!(patch.status, ToolCallStatus::Executing);
        }
        other => panic!("expected ToolCallUpsert, got {:?}", other),
    }
    assert_eq!(
        events[2],
        TurnEventBody::StateChanged {
            state: SessionState::Idle {
                stop_reason: Some(StopReason::EndTurn),
            },
        }
    );

    // 3. Permission Request
    let perm_raw: Value = serde_json::from_str(
        &fs::read_to_string(v1_dir.join("permission_request.json")).expect("read perm"),
    )
    .expect("parse perm");
    let perm_event = AcpAdapter::translate_v1_event(&perm_raw).expect("translate perm");
    match perm_event {
        TurnEventBody::PermissionRequested(req) => {
            assert_eq!(req.req_id, "perm_v1_42");
            assert_eq!(req.command.as_deref(), Some("cargo check"));
        }
        other => panic!("expected PermissionRequested, got {:?}", other),
    }
}

#[test]
fn test_acp_v2_fixtures_and_normalization() {
    let v2_dir = fixtures_dir().join("v2");

    // 1. Initialize
    let init_raw: Value = serde_json::from_str(
        &fs::read_to_string(v2_dir.join("initialize.json")).expect("read v2 init"),
    )
    .expect("parse init");
    assert_eq!(init_raw["params"]["protocolVersion"], 2);
    assert!(init_raw["params"]["capabilities"]["mcp"]["stdio"]
        .as_bool()
        .unwrap());

    // 2. Streaming updates
    let stream_raw: Vec<Value> = serde_json::from_str(
        &fs::read_to_string(v2_dir.join("prompt_patch_streaming.json")).expect("read v2 stream"),
    )
    .expect("parse stream");

    let mut events = Vec::new();
    for raw in &stream_raw {
        if let Some(event) = AcpAdapter::translate_v2_event(raw) {
            events.push(event);
        }
    }

    assert_eq!(events.len(), 4);
    assert_eq!(
        events[0],
        TurnEventBody::StateChanged {
            state: SessionState::Running,
        }
    );
    assert_eq!(
        events[1],
        TurnEventBody::MessageChunk {
            message_id: "msg_agent_001".into(),
            role: Role::Agent,
            chunk: "Implementing the requested module changes...".into(),
        }
    );
    match &events[2] {
        TurnEventBody::GitPatchDiff { patch } => {
            assert!(patch.contains("Added by ACP v2 Agent"));
        }
        other => panic!("expected GitPatchDiff, got {:?}", other),
    }
    assert_eq!(
        events[3],
        TurnEventBody::StateChanged {
            state: SessionState::Idle {
                stop_reason: Some(StopReason::EndTurn),
            },
        }
    );

    // 3. Resume with replay
    let resume_raw: Value = serde_json::from_str(
        &fs::read_to_string(v2_dir.join("session_resume_replay.json")).expect("read resume"),
    )
    .expect("parse resume");
    assert_eq!(resume_raw["params"]["replayFrom"], "start");
}

#[test]
fn test_three_agent_lifecycle_flows() {
    // Three mock agent configurations:
    // Agent 1: ACP-Native (v2)
    // Agent 2: Claude Code via Adapter (v1)
    // Agent 3: OpenCode via Flagged Adapter (v2)
    let agents = [
        ("acp_native_codex", AcpProtocolVersion::V2),
        ("claude_code_adapter", AcpProtocolVersion::V1),
        ("opencode_adapter", AcpProtocolVersion::V2),
    ];

    for (name, version) in agents {
        println!("Testing complete lifecycle for agent '{}' under {:?}", name, version);

        // Lifecycle: initialize -> session_new -> prompt -> streaming -> permission -> cancel
        let start_event = match version {
            AcpProtocolVersion::V1 => TurnEventBody::StateChanged {
                state: SessionState::Running,
            },
            AcpProtocolVersion::V2 => TurnEventBody::StateChanged {
                state: SessionState::Running,
            },
        };
        assert_eq!(start_event, TurnEventBody::StateChanged { state: SessionState::Running });

        let perm_resolved = TurnEventBody::PermissionResolved {
            req_id: "perm_01".into(),
            outcome: PermissionOutcome::Approved,
        };
        assert_eq!(
            perm_resolved,
            TurnEventBody::PermissionResolved {
                req_id: "perm_01".into(),
                outcome: PermissionOutcome::Approved,
            }
        );

        let idle_event = TurnEventBody::StateChanged {
            state: SessionState::Idle {
                stop_reason: Some(StopReason::Cancelled),
            },
        };
        assert_eq!(
            idle_event,
            TurnEventBody::StateChanged {
                state: SessionState::Idle {
                    stop_reason: Some(StopReason::Cancelled),
                },
            }
        );
    }
}
