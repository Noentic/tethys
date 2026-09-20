//! Fixture conformance: every committed transcript must deserialize into the
//! SDK's typed schema and normalize into the expected events.

use std::fs;
use std::path::PathBuf;

use agent_client_protocol::schema::v1 as acp1;
use tethys_acp::map::{v1_update, SyntheticMessageIds};
use tethys_schema::thread::{ContentBlock, Role, ToolCallStatus, TurnEventBody};
#[cfg(feature = "acp-v2")]
use tethys_schema::thread::{SessionState, StopReason};

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .expect("workspace root")
        .join("fixtures/acp")
}

fn v1_notifications() -> Vec<acp1::SessionNotification> {
    let text = fs::read_to_string(fixtures_dir().join("v1/prompt_streaming.jsonl"))
        .expect("read v1 transcript");
    text.lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str(line).expect("schema-valid v1 notification"))
        .collect()
}

#[test]
fn v1_transcript_is_schema_valid_and_normalizes() {
    let notifications = v1_notifications();
    assert_eq!(notifications.len(), 5);

    let mut synthetic = SyntheticMessageIds::default();
    let events: Vec<TurnEventBody> = notifications
        .iter()
        .flat_map(|notification| v1_update(&notification.update, &mut synthetic))
        .collect();

    assert!(matches!(
        &events[0],
        TurnEventBody::MessageChunk(chunk)
            if chunk.message_id == "v1-msg-1"
                && chunk.role == Role::Agent
                && chunk.block == ContentBlock::Text("Hello! ".into())
    ));
    assert!(matches!(
        &events[1],
        TurnEventBody::MessageChunk(chunk)
            if chunk.message_id == "v1-synthetic-1"
                && chunk.block == ContentBlock::Text("Working on it.".into())
    ));
    assert!(matches!(
        &events[2],
        TurnEventBody::ToolCallUpsert { tool_call_id, patch }
            if tool_call_id == "tool-1"
                && patch.title.as_deref() == Some("Read file")
                && patch.status == Some(ToolCallStatus::Executing)
                && patch.locations.len() == 1
                && patch.locations[0].path == "src/main.rs"
    ));
    assert!(matches!(
        &events[3],
        TurnEventBody::CommandsAvailable { commands } if commands[0].name == "test"
    ));
    assert!(matches!(
        &events[4],
        TurnEventBody::PlanUpsert { plan, .. } if plan.entries[0].content == "Do the thing"
    ));
}

#[test]
fn v1_permission_and_prompt_response_are_schema_valid() {
    let text = fs::read_to_string(fixtures_dir().join("v1/permission_request.json"))
        .expect("read permission fixture");
    let request: acp1::RequestPermissionRequest =
        serde_json::from_str(&text).expect("schema-valid permission request");
    assert_eq!(request.options[0].option_id.to_string(), "allow");

    let text = fs::read_to_string(fixtures_dir().join("v1/prompt_response.json"))
        .expect("read prompt response fixture");
    let response: acp1::PromptResponse =
        serde_json::from_str(&text).expect("schema-valid prompt response");
    assert_eq!(response.stop_reason, acp1::StopReason::EndTurn);

    let text = fs::read_to_string(fixtures_dir().join("v1/initialize_request.json"))
        .expect("read initialize fixture");
    let request: acp1::InitializeRequest =
        serde_json::from_str(&text).expect("schema-valid initialize request");
    assert_eq!(
        request.protocol_version,
        agent_client_protocol::schema::ProtocolVersion::V1
    );
}

#[cfg(feature = "acp-v2")]
#[test]
fn v2_transcript_is_schema_valid_and_normalizes() {
    use agent_client_protocol::schema::v2 as acp2;
    use tethys_acp::map_v2::v2_update;

    let text = fs::read_to_string(fixtures_dir().join("v2/prompt_streaming.jsonl"))
        .expect("read v2 transcript");
    let notifications: Vec<acp2::UpdateSessionNotification> = text
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str(line).expect("schema-valid v2 notification"))
        .collect();
    assert_eq!(notifications.len(), 4);

    let events: Vec<TurnEventBody> = notifications
        .iter()
        .flat_map(|notification| v2_update(&notification.update))
        .collect();

    assert!(matches!(
        &events[0],
        TurnEventBody::StateChanged(changed) if changed.state == SessionState::Running
    ));
    assert!(matches!(
        &events[1],
        TurnEventBody::MessageChunk(chunk)
            if chunk.message_id == "v2-msg-1"
                && chunk.block == ContentBlock::Text("Hello v2! ".into())
    ));
    assert!(matches!(
        &events[2],
        TurnEventBody::MessageUpsert(upsert)
            if upsert.message_id == "v2-msg-1"
                && matches!(&upsert.content, tethys_schema::thread::Patch::Set(blocks)
                    if blocks[0] == ContentBlock::Text("Hello v2!".into()))
    ));
    assert!(matches!(
        &events[3],
        TurnEventBody::StateChanged(changed)
            if changed.state == SessionState::Idle {
                stop_reason: Some(StopReason::EndTurn)
            }
    ));

    let text = fs::read_to_string(fixtures_dir().join("v2/permission_request.json"))
        .expect("read v2 permission fixture");
    let request: acp2::RequestPermissionRequest =
        serde_json::from_str(&text).expect("schema-valid v2 permission request");
    assert_eq!(request.title, "Run tests");

    let text = fs::read_to_string(fixtures_dir().join("v2/initialize_request.json"))
        .expect("read v2 initialize fixture");
    let request: acp2::InitializeRequest =
        serde_json::from_str(&text).expect("schema-valid v2 initialize request");
    assert_eq!(
        request.protocol_version,
        agent_client_protocol::schema::ProtocolVersion::V2
    );
}

#[cfg(feature = "acp-v2")]
#[test]
fn v2_unknown_session_update_is_preserved() {
    use agent_client_protocol::schema::v2 as acp2;
    use tethys_acp::map_v2::v2_update;

    let raw = r#"{
        "sessionId": "v2-session-1",
        "update": { "sessionUpdate": "_custom_future", "payload": { "answer": 42 } }
    }"#;
    let notification: acp2::UpdateSessionNotification =
        serde_json::from_str(raw).expect("extension update deserializes");
    match v2_update(&notification.update).first() {
        Some(TurnEventBody::Unknown { raw }) => {
            assert!(
                raw.contains("_custom_future"),
                "raw payload preserved: {raw}"
            );
        }
        other => panic!("expected Unknown, got {other:?}"),
    }
}
