use super::events::*;
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AcpProtocolVersion {
    V1,
    V2,
}

pub struct AcpAdapter;

impl AcpAdapter {
    /// Translates raw v1 incoming messages into unified TurnEventBody events.
    pub fn translate_v1_event(raw: &Value) -> Option<TurnEventBody> {
        let method = raw.get("method")?.as_str()?;
        let params = raw.get("params").unwrap_or(&Value::Null);

        match method {
            "session/update" => {
                if let Some(content) = params.get("content").and_then(|c| c.as_str()) {
                    let msg_id = params
                        .get("messageId")
                        .and_then(|id| id.as_str())
                        .unwrap_or("v1_msg_0")
                        .to_string();
                    Some(TurnEventBody::MessageChunk {
                        message_id: msg_id,
                        role: Role::Agent,
                        chunk: content.to_string(),
                    })
                } else if let Some(tool) = params.get("toolCall") {
                    let tool_id = tool
                        .get("id")
                        .and_then(|id| id.as_str())
                        .unwrap_or("tool_0")
                        .to_string();
                    let name = tool.get("name").and_then(|n| n.as_str()).map(String::from);
                    Some(TurnEventBody::ToolCallUpsert {
                        tool_call_id: tool_id,
                        patch: ToolCallPatch {
                            name,
                            input_json: tool.get("input").map(|v| v.to_string()),
                            status: ToolCallStatus::Executing,
                        },
                    })
                } else {
                    None
                }
            }
            "session/permission" => {
                let req_id = params
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("req_0")
                    .to_string();
                let title = params
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Permission Required")
                    .to_string();
                Some(TurnEventBody::PermissionRequested(PermissionRequest {
                    req_id,
                    title,
                    description: params.get("description").and_then(|d| d.as_str()).map(String::from),
                    tool_name: params.get("tool").and_then(|t| t.as_str()).map(String::from),
                    command: params.get("command").and_then(|c| c.as_str()).map(String::from),
                }))
            }
            "session/done" => Some(TurnEventBody::StateChanged {
                state: SessionState::Idle {
                    stop_reason: Some(StopReason::EndTurn),
                },
            }),
            _ => None,
        }
    }

    /// Translates raw v2 incoming state_update messages directly into TurnEventBody events.
    pub fn translate_v2_event(raw: &Value) -> Option<TurnEventBody> {
        let method = raw.get("method")?.as_str()?;
        let params = raw.get("params").unwrap_or(&Value::Null);

        match method {
            "session/state_update" => {
                let state_str = params.get("state").and_then(|s| s.as_str())?;
                match state_str {
                    "running" => Some(TurnEventBody::StateChanged {
                        state: SessionState::Running,
                    }),
                    "requires_action" => Some(TurnEventBody::StateChanged {
                        state: SessionState::RequiresAction,
                    }),
                    "idle" => {
                        let reason = params
                            .get("stopReason")
                            .and_then(|r| r.as_str())
                            .map(|r| match r {
                                "cancelled" => StopReason::Cancelled,
                                "max_tokens" => StopReason::MaxTokens,
                                "error" => StopReason::Error,
                                _ => StopReason::EndTurn,
                            });
                        Some(TurnEventBody::StateChanged {
                            state: SessionState::Idle {
                                stop_reason: reason,
                            },
                        })
                    }
                    _ => None,
                }
            }
            "session/patch" => {
                if let Some(msg_id) = params.get("messageId").and_then(|m| m.as_str()) {
                    let chunk = params
                        .get("chunk")
                        .and_then(|c| c.as_str())
                        .unwrap_or_default()
                        .to_string();
                    Some(TurnEventBody::MessageChunk {
                        message_id: msg_id.to_string(),
                        role: Role::Agent,
                        chunk,
                    })
                } else {
                    params.get("git_patch").and_then(|d| d.as_str()).map(|diff| {
                        TurnEventBody::GitPatchDiff {
                            patch: diff.to_string(),
                        }
                    })
                }
            }
            _ => None,
        }
    }
}
