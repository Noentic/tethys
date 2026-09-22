//! ACP v1 → normalized `TurnEventBody` mapping.
//!
//! v2 mapping lives in [`crate::map_v2`] behind the `acp-v2` feature.

use agent_client_protocol::schema::v1 as acp1;
use agent_client_protocol::schema::MaybeUndefined;
use imara_diff::{Algorithm, BasicLineDiffPrinter, Diff, InternedInput, UnifiedDiffConfig};
use serde::Serialize;
use tethys_schema::thread::{
    AgentCommand, ConfigOption, ConfigOptionKind, ConfigOptionValue, ContentBlock, MessageChunk,
    PermissionSubject, PlanContent, PlanEntry, PlanEntryPriority, PlanEntryStatus, Role,
    SessionState, StateChanged, StopReason, ToolCallContent, ToolCallPatch, ToolCallStatus,
    ToolKind, ToolLocation, TurnEventBody,
};

/// Deterministic synthetic message IDs for v1 chunks that omit `messageId`:
/// one ID per contiguous run of a role (architecture §7.3).
#[derive(Debug, Default)]
pub struct SyntheticMessageIds {
    last_role: Option<Role>,
    ordinal: u32,
}

impl SyntheticMessageIds {
    pub fn id(&mut self, explicit: Option<&str>, role: Role) -> String {
        if let Some(id) = explicit {
            self.last_role = None;
            return id.to_string();
        }
        if self.last_role != Some(role) {
            self.ordinal += 1;
            self.last_role = Some(role);
        }
        format!("v1-synthetic-{}", self.ordinal)
    }
}

/// Maps one `session/update` payload to zero or more normalized events
/// (tool calls may carry inline content that becomes content chunks).
pub fn v1_update(
    update: &acp1::SessionUpdate,
    synthetic: &mut SyntheticMessageIds,
) -> Vec<TurnEventBody> {
    match update {
        acp1::SessionUpdate::UserMessageChunk(chunk) => {
            vec![message_chunk(chunk, Role::User, synthetic)]
        }
        acp1::SessionUpdate::AgentMessageChunk(chunk) => {
            vec![message_chunk(chunk, Role::Agent, synthetic)]
        }
        acp1::SessionUpdate::AgentThoughtChunk(chunk) => {
            vec![message_chunk(chunk, Role::Thought, synthetic)]
        }
        acp1::SessionUpdate::ToolCall(tool_call) => {
            let tool_call_id = tool_call.tool_call_id.to_string();
            let mut events = vec![TurnEventBody::ToolCallUpsert {
                tool_call_id: tool_call_id.clone(),
                patch: v1_tool_patch(tool_call),
            }];
            events.extend(tool_call.content.iter().map(|content| {
                TurnEventBody::ToolCallContentChunk {
                    tool_call_id: tool_call_id.clone(),
                    item: tool_content_v1(content),
                }
            }));
            events
        }
        acp1::SessionUpdate::ToolCallUpdate(update) => {
            let tool_call_id = update.tool_call_id.to_string();
            let mut events = vec![TurnEventBody::ToolCallUpsert {
                tool_call_id: tool_call_id.clone(),
                patch: v1_tool_update_patch(&update.fields),
            }];
            if let Some(content) = &update.fields.content {
                events.extend(
                    content
                        .iter()
                        .map(|item| TurnEventBody::ToolCallContentChunk {
                            tool_call_id: tool_call_id.clone(),
                            item: tool_content_v1(item),
                        }),
                );
            }
            events
        }
        acp1::SessionUpdate::Plan(plan) => vec![TurnEventBody::PlanUpsert {
            plan_id: "default".to_string(),
            plan: PlanContent {
                entries: plan.entries.iter().map(plan_entry).collect(),
            },
        }],
        acp1::SessionUpdate::AvailableCommandsUpdate(update) => {
            vec![TurnEventBody::CommandsAvailable {
                commands: update.available_commands.iter().map(command).collect(),
            }]
        }
        acp1::SessionUpdate::CurrentModeUpdate(update) => {
            vec![TurnEventBody::ConfigOptionsChanged {
                options: vec![ConfigOption {
                    id: "mode".to_string(),
                    name: "Mode".to_string(),
                    description: None,
                    current_value: update.current_mode_id.to_string(),
                    values: vec![],
                    category: Some("mode".to_string()),
                    kind: Some(ConfigOptionKind::Select),
                    value_options: vec![],
                }],
            }]
        }
        acp1::SessionUpdate::ConfigOptionUpdate(update) => {
            vec![TurnEventBody::ConfigOptionsChanged {
                options: update.config_options.iter().map(config_option).collect(),
            }]
        }
        acp1::SessionUpdate::SessionInfoUpdate(update) => {
            vec![TurnEventBody::SessionInfo(
                tethys_schema::thread::SessionInfo {
                    title: maybe_string(&update.title),
                    updated_at: maybe_string(&update.updated_at),
                },
            )]
        }
        acp1::SessionUpdate::UsageUpdate(update) => vec![TurnEventBody::Usage {
            snapshot: tethys_schema::thread::UsageSnapshot {
                input_tokens: 0,
                output_tokens: 0,
                total_tokens: update.used.min(u32::MAX as u64) as u32,
                cost: update.cost.as_ref().map(|cost| cost.amount),
                context_size: Some(update.size.min(u32::MAX as u64) as u32),
                cost_currency: update.cost.as_ref().map(|cost| cost.currency.clone()),
            },
        }],
        other => vec![TurnEventBody::Unknown {
            raw: json_string(other),
        }],
    }
}

fn message_chunk(
    chunk: &acp1::ContentChunk,
    role: Role,
    synthetic: &mut SyntheticMessageIds,
) -> TurnEventBody {
    let message_id = synthetic.id(
        chunk
            .message_id
            .as_ref()
            .map(|id| id.to_string())
            .as_deref(),
        role,
    );
    TurnEventBody::MessageChunk(MessageChunk {
        message_id,
        role,
        block: content_block(&chunk.content),
    })
}

pub(crate) fn v1_tool_patch(tool_call: &acp1::ToolCall) -> ToolCallPatch {
    ToolCallPatch {
        title: Some(tool_call.title.clone()),
        kind: Some(tool_kind(&tool_call.kind)),
        status: Some(tool_status_v1(tool_call.status)),
        input: tool_call.raw_input.as_ref().map(json_string),
        output: tool_call.raw_output.as_ref().map(json_string),
        origin: None,
        parent_tool_call_id: None,
        locations: tool_call.locations.iter().map(tool_location).collect(),
    }
}

pub(crate) fn v1_tool_update_patch(fields: &acp1::ToolCallUpdateFields) -> ToolCallPatch {
    ToolCallPatch {
        title: fields.title.clone(),
        kind: fields.kind.as_ref().map(tool_kind),
        status: fields.status.map(tool_status_v1),
        input: fields.raw_input.as_ref().map(json_string),
        output: fields.raw_output.as_ref().map(json_string),
        origin: None,
        parent_tool_call_id: None,
        locations: fields
            .locations
            .as_ref()
            .map(|locations| locations.iter().map(tool_location).collect())
            .unwrap_or_default(),
    }
}

pub(crate) fn tool_status_v1(status: acp1::ToolCallStatus) -> ToolCallStatus {
    match status {
        acp1::ToolCallStatus::Pending => ToolCallStatus::Pending,
        acp1::ToolCallStatus::InProgress => ToolCallStatus::Executing,
        acp1::ToolCallStatus::Completed => ToolCallStatus::Completed,
        acp1::ToolCallStatus::Failed => ToolCallStatus::Failed,
        _ => ToolCallStatus::Failed,
    }
}

pub(crate) fn tool_content_v1(content: &acp1::ToolCallContent) -> ToolCallContent {
    match content {
        acp1::ToolCallContent::Content(inner) => ToolCallContent::Text(text_or_raw(&inner.content)),
        acp1::ToolCallContent::Terminal(terminal) => ToolCallContent::Terminal {
            terminal_id: terminal.terminal_id.to_string(),
        },
        acp1::ToolCallContent::Diff(diff) => ToolCallContent::Diff {
            path: diff.path.display().to_string(),
            patch: unified_diff(diff.old_text.as_deref().unwrap_or(""), &diff.new_text),
        },
        other => ToolCallContent::Unknown(json_string(other)),
    }
}

/// Renders a unified diff between two texts (empty when identical).
pub(crate) fn unified_diff(before: &str, after: &str) -> String {
    if before == after {
        return String::new();
    }
    let input = InternedInput::new(before, after);
    let mut diff = Diff::compute(Algorithm::Histogram, &input);
    diff.postprocess_lines(&input);
    diff.unified_diff(
        &BasicLineDiffPrinter(&input.interner),
        UnifiedDiffConfig::default(),
        &input,
    )
    .to_string()
}

pub(crate) fn content_block(block: &acp1::ContentBlock) -> ContentBlock {
    match block {
        acp1::ContentBlock::Text(text) => match acp_metadata(text, &["text"]) {
            Some(acp_metadata) => ContentBlock::TextWithMetadata {
                text: text.text.clone(),
                acp_metadata,
            },
            None => ContentBlock::Text(text.text.clone()),
        },
        acp1::ContentBlock::ResourceLink(link) => ContentBlock::ResourceLink {
            uri: link.uri.clone(),
            name: link.name.clone(),
            mime_type: link.mime_type.clone(),
            acp_metadata: acp_metadata(link, &["name", "uri", "mimeType"]),
        },
        acp1::ContentBlock::Image(image) => ContentBlock::Image {
            mime_type: image.mime_type.clone(),
            data: image.data.clone(),
            acp_metadata: acp_metadata(image, &["data", "mimeType"]),
        },
        acp1::ContentBlock::Audio(audio) => ContentBlock::Audio {
            mime_type: audio.mime_type.clone(),
            data: audio.data.clone(),
            acp_metadata: acp_metadata(audio, &["data", "mimeType"]),
        },
        acp1::ContentBlock::Resource(resource) => {
            let (uri, mime_type, text, blob, nested_metadata) = match &resource.resource {
                acp1::EmbeddedResourceResource::TextResourceContents(contents) => (
                    contents.uri.clone(),
                    contents.mime_type.clone(),
                    Some(contents.text.clone()),
                    None,
                    acp_metadata(contents, &["uri", "mimeType", "text"]),
                ),
                acp1::EmbeddedResourceResource::BlobResourceContents(contents) => (
                    contents.uri.clone(),
                    contents.mime_type.clone(),
                    None,
                    Some(contents.blob.clone()),
                    acp_metadata(contents, &["uri", "mimeType", "blob"]),
                ),
                _ => return ContentBlock::Unknown(json_string(block)),
            };
            let top_metadata = acp_metadata(resource, &["resource"]);
            let mut metadata = serde_json::Map::new();
            if let Some(raw) = top_metadata {
                if let Ok(serde_json::Value::Object(fields)) = serde_json::from_str(&raw) {
                    metadata.extend(fields);
                }
            }
            if let Some(raw) = nested_metadata {
                if let Ok(value) = serde_json::from_str(&raw) {
                    metadata.insert("resource_content".into(), value);
                }
            }
            ContentBlock::Resource {
                uri,
                mime_type,
                text,
                blob,
                acp_metadata: (!metadata.is_empty())
                    .then(|| serde_json::Value::Object(metadata).to_string()),
            }
        }
        other => ContentBlock::Unknown(json_string(other)),
    }
}

pub(crate) fn acp_metadata<T: Serialize>(value: &T, core_fields: &[&str]) -> Option<String> {
    let serde_json::Value::Object(mut fields) = serde_json::to_value(value).ok()? else {
        return None;
    };
    for field in core_fields {
        fields.remove(*field);
    }
    fields.retain(|_, value| !value.is_null());
    (!fields.is_empty()).then(|| serde_json::Value::Object(fields).to_string())
}

pub(crate) fn stop_reason(reason: &acp1::StopReason) -> StopReason {
    match reason {
        acp1::StopReason::EndTurn => StopReason::EndTurn,
        acp1::StopReason::MaxTokens => StopReason::MaxTokens,
        acp1::StopReason::MaxTurnRequests => StopReason::MaxTurnRequests,
        acp1::StopReason::Refusal => StopReason::Refusal,
        acp1::StopReason::Cancelled => StopReason::Cancelled,
        _ => StopReason::Other("unknown".to_string()),
    }
}

pub(crate) fn plan_entry(entry: &acp1::PlanEntry) -> PlanEntry {
    PlanEntry {
        content: entry.content.clone(),
        priority: match entry.priority {
            acp1::PlanEntryPriority::High => PlanEntryPriority::High,
            acp1::PlanEntryPriority::Medium => PlanEntryPriority::Medium,
            acp1::PlanEntryPriority::Low => PlanEntryPriority::Low,
            _ => PlanEntryPriority::Medium,
        },
        status: match entry.status {
            acp1::PlanEntryStatus::Pending => PlanEntryStatus::Pending,
            acp1::PlanEntryStatus::InProgress => PlanEntryStatus::InProgress,
            acp1::PlanEntryStatus::Completed => PlanEntryStatus::Completed,
            _ => PlanEntryStatus::Pending,
        },
    }
}

pub(crate) fn command(command: &acp1::AvailableCommand) -> AgentCommand {
    AgentCommand {
        name: command.name.clone(),
        description: Some(command.description.clone()),
        input: command.input.as_ref().map(json_string),
    }
}

/// ACP v1 mode state mapped onto the normalized option shape, so the UI keeps
/// one control path for modes and config options (M1.17 AD6).
pub(crate) fn mode_option(state: &acp1::SessionModeState) -> ConfigOption {
    ConfigOption {
        id: "mode".to_string(),
        name: "Mode".to_string(),
        description: None,
        current_value: state.current_mode_id.to_string(),
        values: state
            .available_modes
            .iter()
            .map(|mode| mode.id.to_string())
            .collect(),
        category: Some("mode".to_string()),
        kind: Some(ConfigOptionKind::Select),
        value_options: state
            .available_modes
            .iter()
            .map(|mode| ConfigOptionValue {
                id: mode.id.to_string(),
                name: mode.name.clone(),
                description: mode.description.clone(),
            })
            .collect(),
    }
}

pub(crate) fn config_option(option: &acp1::SessionConfigOption) -> ConfigOption {
    let (current_value, values, value_options, kind) = match &option.kind {
        acp1::SessionConfigKind::Select(select) => {
            let (values, value_options) = match &select.options {
                acp1::SessionConfigSelectOptions::Ungrouped(options) => (
                    options
                        .iter()
                        .map(|option| option.value.to_string())
                        .collect(),
                    options
                        .iter()
                        .map(|option| ConfigOptionValue {
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
                ConfigOptionKind::Select,
            )
        }
        acp1::SessionConfigKind::Boolean(boolean) => (
            boolean.current_value.to_string(),
            vec!["true".to_string(), "false".to_string()],
            vec![],
            ConfigOptionKind::Boolean,
        ),
        _ => (String::new(), vec![], vec![], ConfigOptionKind::Select),
    };

    ConfigOption {
        id: option.id.to_string(),
        name: option.name.clone(),
        description: option.description.clone(),
        current_value,
        values,
        category: option.category.as_ref().map(label),
        kind: Some(kind),
        value_options,
    }
}

pub(crate) fn label(value: &impl Serialize) -> String {
    json_string(value).trim_matches('"').to_string()
}

pub(crate) fn tool_kind(kind: &acp1::ToolKind) -> ToolKind {
    ToolKind::parse(&label(kind))
}

pub(crate) fn tool_location(location: &acp1::ToolCallLocation) -> ToolLocation {
    ToolLocation {
        path: location.path.display().to_string(),
        line: location.line,
    }
}

/// The normalized subject for a permission request. An edit-like tool call with
/// a known location becomes a `File` subject so the Auto-edit policy can scope
/// it to the thread root (M1.8 U3); everything else stays a `ToolCall`.
pub(crate) fn permission_subject(tool_call: &acp1::ToolCallUpdate) -> PermissionSubject {
    let fields = &tool_call.fields;
    let edit_like = matches!(
        fields.kind.as_ref(),
        Some(acp1::ToolKind::Edit | acp1::ToolKind::Delete | acp1::ToolKind::Move)
    );
    if edit_like {
        if let Some(location) = fields.locations.as_ref().and_then(|list| list.first()) {
            return PermissionSubject::File {
                path: location.path.display().to_string(),
            };
        }
    }
    PermissionSubject::ToolCall {
        tool_call_id: tool_call.tool_call_id.to_string(),
    }
}

fn text_or_raw(block: &acp1::ContentBlock) -> String {
    match block {
        acp1::ContentBlock::Text(text) => text.text.clone(),
        other => json_string(other),
    }
}

fn maybe_string(value: &MaybeUndefined<String>) -> Option<String> {
    match value {
        MaybeUndefined::Value(text) => Some(text.clone()),
        MaybeUndefined::Null | MaybeUndefined::Undefined => None,
    }
}

pub(crate) fn json_string(value: &impl Serialize) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "null".to_string())
}

pub(crate) fn state_changed(state: SessionState) -> TurnEventBody {
    TurnEventBody::StateChanged(StateChanged { state })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn edit_tool_call_with_location_becomes_a_file_subject() {
        let update = acp1::ToolCallUpdate::new(
            "tool-1",
            acp1::ToolCallUpdateFields::new()
                .kind(acp1::ToolKind::Edit)
                .locations(vec![acp1::ToolCallLocation::new("/repo/src/a.rs")]),
        );
        assert_eq!(
            permission_subject(&update),
            PermissionSubject::File {
                path: "/repo/src/a.rs".into()
            }
        );
    }

    #[test]
    fn non_edit_tool_call_stays_a_tool_call_subject() {
        let update = acp1::ToolCallUpdate::new(
            "tool-2",
            acp1::ToolCallUpdateFields::new().kind(acp1::ToolKind::Execute),
        );
        assert_eq!(
            permission_subject(&update),
            PermissionSubject::ToolCall {
                tool_call_id: "tool-2".into()
            }
        );
    }

    #[test]
    fn content_blocks_preserve_stable_media_resources_and_metadata() {
        let cases = [
            json!({"type":"text","text":"hello","_meta":{"trace":"1"}}),
            json!({"type":"resource_link","uri":"file:///tmp/a.txt","name":"a.txt","mimeType":"text/plain","description":"file"}),
            json!({"type":"image","data":"aW1hZ2U=","mimeType":"image/png","uri":"urn:image"}),
            json!({"type":"audio","data":"YXVkaW8=","mimeType":"audio/wav"}),
            json!({"type":"resource","resource":{"uri":"urn:text","mimeType":"text/plain","text":"embedded"}}),
            json!({"type":"resource","resource":{"uri":"urn:blob","mimeType":"application/octet-stream","blob":"YmxvYg=="}}),
        ];

        let blocks = cases
            .into_iter()
            .map(|value| serde_json::from_value::<acp1::ContentBlock>(value).expect("ACP block"))
            .map(|block| content_block(&block))
            .collect::<Vec<_>>();

        assert!(matches!(blocks[0], ContentBlock::TextWithMetadata { .. }));
        assert!(matches!(blocks[1], ContentBlock::ResourceLink { .. }));
        assert!(matches!(blocks[2], ContentBlock::Image { .. }));
        assert!(matches!(blocks[3], ContentBlock::Audio { .. }));
        assert!(matches!(
            blocks[4],
            ContentBlock::Resource { text: Some(_), .. }
        ));
        assert!(matches!(
            blocks[5],
            ContentBlock::Resource { blob: Some(_), .. }
        ));
    }
}
