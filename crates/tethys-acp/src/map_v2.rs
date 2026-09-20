//! ACP v2 → normalized `TurnEventBody` mapping (feature `acp-v2`).

use agent_client_protocol::schema::v2 as acp2;
use agent_client_protocol::schema::MaybeUndefined;
use tethys_schema::thread::{
    AgentCommand, ConfigOption, ContentBlock, MessageChunk, MessageUpsert, Patch, PlanContent,
    PlanEntry, PlanEntryPriority, PlanEntryStatus, Role, SessionState, StopReason, ToolCallContent,
    ToolCallPatch, ToolCallStatus, TurnEventBody,
};

use crate::map::{json_string, state_changed};

/// Maps one `session/update` payload to zero or more normalized events.
pub fn v2_update(update: &acp2::SessionUpdate) -> Vec<TurnEventBody> {
    match update {
        acp2::SessionUpdate::UserMessageChunk(chunk) => {
            vec![chunk_event(chunk, Role::User)]
        }
        acp2::SessionUpdate::AgentMessageChunk(chunk) => vec![chunk_event(chunk, Role::Agent)],
        acp2::SessionUpdate::AgentThoughtChunk(chunk) => {
            vec![chunk_event(chunk, Role::Thought)]
        }
        acp2::SessionUpdate::UserMessage(message) => vec![upsert_event(
            &message.message_id.to_string(),
            Role::User,
            &message.content,
        )],
        acp2::SessionUpdate::AgentMessage(message) => vec![upsert_event(
            &message.message_id.to_string(),
            Role::Agent,
            &message.content,
        )],
        acp2::SessionUpdate::AgentThought(message) => vec![upsert_event(
            &message.message_id.to_string(),
            Role::Thought,
            &message.content,
        )],
        acp2::SessionUpdate::StateUpdate(state) => match state {
            acp2::StateUpdate::Running(_) => vec![state_changed(SessionState::Running)],
            acp2::StateUpdate::Idle(idle) => vec![state_changed(SessionState::Idle {
                stop_reason: idle.stop_reason.as_ref().map(stop_reason),
            })],
            acp2::StateUpdate::RequiresAction(_) => {
                vec![state_changed(SessionState::RequiresAction)]
            }
            other => vec![unknown(other)],
        },
        acp2::SessionUpdate::ToolCallUpdate(update) => {
            let tool_call_id = update.tool_call_id.to_string();
            let mut events = vec![TurnEventBody::ToolCallUpsert {
                tool_call_id: tool_call_id.clone(),
                patch: tool_patch(update),
            }];
            if let MaybeUndefined::Value(content) = &update.content {
                events.extend(
                    content
                        .iter()
                        .map(|item| TurnEventBody::ToolCallContentChunk {
                            tool_call_id: tool_call_id.clone(),
                            item: tool_content(item),
                        }),
                );
            }
            events
        }
        acp2::SessionUpdate::ToolCallContentChunk(chunk) => {
            vec![TurnEventBody::ToolCallContentChunk {
                tool_call_id: chunk.tool_call_id.to_string(),
                item: tool_content(&chunk.content),
            }]
        }
        acp2::SessionUpdate::TerminalOutputChunk(chunk) => {
            vec![TurnEventBody::TerminalOutputChunk {
                terminal_id: chunk.terminal_id.to_string(),
                bytes: chunk.data.clone(),
            }]
        }
        acp2::SessionUpdate::PlanUpdate(update) => match &update.plan {
            acp2::PlanUpdateContent::Items(items) => vec![TurnEventBody::PlanUpsert {
                plan_id: "default".to_string(),
                plan: PlanContent {
                    entries: items.entries.iter().map(plan_entry).collect(),
                },
            }],
            other => vec![unknown(other)],
        },
        acp2::SessionUpdate::AvailableCommandsUpdate(update) => {
            vec![TurnEventBody::CommandsAvailable {
                commands: update.available_commands.iter().map(command).collect(),
            }]
        }
        acp2::SessionUpdate::ConfigOptionUpdate(update) => {
            vec![TurnEventBody::ConfigOptionsChanged {
                options: update.config_options.iter().map(config_option).collect(),
            }]
        }
        acp2::SessionUpdate::SessionInfoUpdate(update) => {
            vec![TurnEventBody::SessionInfo(
                tethys_schema::thread::SessionInfo {
                    title: maybe_string(&update.title),
                    updated_at: maybe_string(&update.updated_at),
                },
            )]
        }
        acp2::SessionUpdate::UsageUpdate(update) => vec![TurnEventBody::Usage {
            snapshot: tethys_schema::thread::UsageSnapshot {
                input_tokens: 0,
                output_tokens: 0,
                total_tokens: update.used.min(u32::MAX as u64) as u32,
                cost: update.cost.as_ref().map(|cost| cost.amount),
                context_size: Some(update.size.min(u32::MAX as u64) as u32),
                cost_currency: update.cost.as_ref().map(|cost| cost.currency.clone()),
            },
        }],
        other => vec![unknown(other)],
    }
}

fn chunk_event(chunk: &acp2::ContentChunk, role: Role) -> TurnEventBody {
    TurnEventBody::MessageChunk(MessageChunk {
        message_id: chunk.message_id.to_string(),
        role,
        block: content_block(&chunk.content),
    })
}

fn upsert_event(
    message_id: &str,
    role: Role,
    content: &MaybeUndefined<Vec<acp2::ContentBlock>>,
) -> TurnEventBody {
    let content = match content {
        MaybeUndefined::Undefined => Patch::Unchanged,
        MaybeUndefined::Null => Patch::Clear,
        MaybeUndefined::Value(blocks) => Patch::Set(blocks.iter().map(content_block).collect()),
    };
    TurnEventBody::MessageUpsert(MessageUpsert {
        message_id: message_id.to_string(),
        role,
        content,
    })
}

fn tool_patch(update: &acp2::ToolCallUpdate) -> ToolCallPatch {
    ToolCallPatch {
        title: maybe_string(&update.title),
        kind: maybe_value(&update.kind).map(tool_kind),
        status: maybe_value(&update.status).map(tool_status),
        input: maybe_value(&update.raw_input).map(json_string),
        output: maybe_value(&update.raw_output).map(json_string),
        origin: None,
        parent_tool_call_id: None,
        locations: maybe_value(&update.locations)
            .map(|locations| locations.iter().map(tool_location).collect())
            .unwrap_or_default(),
    }
}

fn tool_kind(kind: &acp2::ToolKind) -> tethys_schema::thread::ToolKind {
    tethys_schema::thread::ToolKind::parse(json_string(kind).trim_matches('"'))
}

fn tool_location(location: &acp2::ToolCallLocation) -> tethys_schema::thread::ToolLocation {
    tethys_schema::thread::ToolLocation {
        path: location.path.0.display().to_string(),
        line: location.line,
    }
}

fn tool_status(status: &acp2::ToolCallStatus) -> ToolCallStatus {
    match status {
        acp2::ToolCallStatus::Pending => ToolCallStatus::Pending,
        acp2::ToolCallStatus::InProgress => ToolCallStatus::Executing,
        acp2::ToolCallStatus::Completed => ToolCallStatus::Completed,
        acp2::ToolCallStatus::Failed | acp2::ToolCallStatus::Cancelled => ToolCallStatus::Failed,
        acp2::ToolCallStatus::Other(_) => ToolCallStatus::Failed,
        _ => ToolCallStatus::Failed,
    }
}

pub(crate) fn tool_content(content: &acp2::ToolCallContent) -> ToolCallContent {
    match content {
        acp2::ToolCallContent::Content(inner) => ToolCallContent::Text(text_or_raw(&inner.content)),
        acp2::ToolCallContent::Terminal(terminal) => ToolCallContent::Terminal {
            terminal_id: terminal.terminal_id.to_string(),
        },
        acp2::ToolCallContent::Diff(diff) => ToolCallContent::Unknown(json_string(diff)),
        acp2::ToolCallContent::Other(other) => ToolCallContent::Unknown(json_string(other)),
        _ => ToolCallContent::Unknown("null".to_string()),
    }
}

fn content_block(block: &acp2::ContentBlock) -> ContentBlock {
    match block {
        acp2::ContentBlock::Text(text) => ContentBlock::Text(text.text.clone()),
        acp2::ContentBlock::ResourceLink(link) => ContentBlock::ResourceLink {
            uri: link.uri.clone(),
            name: link.name.clone(),
            mime_type: link.mime_type.as_ref().map(|mime| mime.to_string()),
        },
        acp2::ContentBlock::Image(image) => ContentBlock::Image {
            mime_type: image.mime_type.to_string(),
            data: image.data.clone(),
        },
        other => ContentBlock::Unknown(json_string(other)),
    }
}

fn stop_reason(reason: &acp2::StopReason) -> StopReason {
    match reason {
        acp2::StopReason::EndTurn => StopReason::EndTurn,
        acp2::StopReason::MaxTokens => StopReason::MaxTokens,
        acp2::StopReason::MaxTurnRequests => StopReason::MaxTurnRequests,
        acp2::StopReason::Refusal => StopReason::Refusal,
        acp2::StopReason::Cancelled => StopReason::Cancelled,
        acp2::StopReason::Other(reason) => StopReason::Other(reason.to_string()),
        _ => StopReason::Other("unknown".to_string()),
    }
}

fn plan_entry(entry: &acp2::PlanEntry) -> PlanEntry {
    PlanEntry {
        content: entry.content.clone(),
        priority: match entry.priority {
            acp2::PlanEntryPriority::High => PlanEntryPriority::High,
            acp2::PlanEntryPriority::Medium => PlanEntryPriority::Medium,
            acp2::PlanEntryPriority::Low => PlanEntryPriority::Low,
            _ => PlanEntryPriority::Medium,
        },
        status: match entry.status {
            acp2::PlanEntryStatus::Pending => PlanEntryStatus::Pending,
            acp2::PlanEntryStatus::InProgress => PlanEntryStatus::InProgress,
            acp2::PlanEntryStatus::Completed => PlanEntryStatus::Completed,
            _ => PlanEntryStatus::Pending,
        },
    }
}

fn command(command: &acp2::AvailableCommand) -> AgentCommand {
    AgentCommand {
        name: command.name.clone(),
        description: Some(command.description.clone()),
        input: command.input.as_ref().map(json_string),
    }
}

pub(crate) fn config_option(option: &acp2::SessionConfigOption) -> ConfigOption {
    let (current_value, values, value_options, kind) = match &option.kind {
        acp2::SessionConfigKind::Select(select) => {
            let (values, value_options) = match &select.options {
                acp2::SessionConfigSelectOptions::Ungrouped(options) => (
                    options
                        .iter()
                        .map(|option| option.value.to_string())
                        .collect(),
                    options
                        .iter()
                        .map(|option| tethys_schema::thread::ConfigOptionValue {
                            id: option.value.to_string(),
                            name: option.name.clone(),
                            description: option.description.clone(),
                        })
                        .collect(),
                ),
                _ => (vec![], vec![]),
            };
            (
                select.current_value.to_string(),
                values,
                value_options,
                tethys_schema::thread::ConfigOptionKind::Select,
            )
        }
        acp2::SessionConfigKind::Boolean(boolean) => (
            boolean.current_value.to_string(),
            vec!["true".to_string(), "false".to_string()],
            vec![],
            tethys_schema::thread::ConfigOptionKind::Boolean,
        ),
        _ => (
            String::new(),
            vec![],
            vec![],
            tethys_schema::thread::ConfigOptionKind::Select,
        ),
    };

    ConfigOption {
        id: option.config_id.to_string(),
        name: option.name.clone(),
        description: option.description.clone(),
        current_value,
        values,
        category: option
            .category
            .as_ref()
            .map(|category| json_string(category).trim_matches('"').to_string()),
        kind: Some(kind),
        value_options,
    }
}

fn text_or_raw(block: &acp2::ContentBlock) -> String {
    match block {
        acp2::ContentBlock::Text(text) => text.text.clone(),
        other => json_string(other),
    }
}

fn maybe_string(value: &MaybeUndefined<String>) -> Option<String> {
    match value {
        MaybeUndefined::Value(text) => Some(text.clone()),
        MaybeUndefined::Null | MaybeUndefined::Undefined => None,
    }
}

fn maybe_value<T>(value: &MaybeUndefined<T>) -> Option<&T> {
    match value {
        MaybeUndefined::Value(inner) => Some(inner),
        MaybeUndefined::Null | MaybeUndefined::Undefined => None,
    }
}

fn unknown(value: &impl serde::Serialize) -> TurnEventBody {
    TurnEventBody::Unknown {
        raw: json_string(value),
    }
}

/// Maps a v2 permission request to the normalized request (D14).
pub(crate) fn permission_request(
    request: &acp2::RequestPermissionRequest,
) -> tethys_schema::thread::PermissionRequested {
    tethys_schema::thread::PermissionRequested {
        req_id: String::new(),
        title: request.title.clone(),
        description: request.description.clone(),
        subject: request.subject.as_ref().map(subject),
        options: request
            .options
            .iter()
            .map(|option| tethys_schema::thread::PermOption {
                option_id: option.option_id.to_string(),
                name: option.name.clone(),
                kind: Some(json_string(&option.kind).trim_matches('"').to_string()),
            })
            .collect(),
    }
}

fn subject(subject: &acp2::RequestPermissionSubject) -> tethys_schema::thread::PermissionSubject {
    match subject {
        acp2::RequestPermissionSubject::Command(command) => {
            tethys_schema::thread::PermissionSubject::Command {
                command: command.command.clone(),
            }
        }
        acp2::RequestPermissionSubject::ToolCall(tool_call) => {
            tethys_schema::thread::PermissionSubject::ToolCall {
                tool_call_id: tool_call.tool_call.tool_call_id.to_string(),
            }
        }
        other => tethys_schema::thread::PermissionSubject::Unknown(json_string(other)),
    }
}
