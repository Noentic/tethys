//! Claude Agent ACP metadata supported by the existing Tethys surfaces.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::{json, Map, Value};
use tethys_acp::client::{
    AcpProviderIntegration, ConfigOptionsHandler, PermissionMetadataHandler, PromptResponseHandler,
    SessionUpdateHandler,
};
use tethys_schema::thread::{
    AgentCommandControl, ConfigOption, Patch, PermissionRequested, SessionGoal, SessionInfo,
    ToolCallPatch, ToolCallStatus, ToolKind, ToolOrigin, TurnEventBody,
};

pub const REGISTRY_ID: &str = "claude-acp";

/// Claims only metadata whose client-side behavior is implemented here.
pub fn descriptor() -> AcpProviderIntegration {
    let mut client_capabilities_meta = Map::new();
    client_capabilities_meta.insert(
        "jetbrains".into(),
        json!({
            "air": {
                "version": 1,
                "capabilities": [
                    "nativeSubagentSessions",
                    "recommendedValue",
                    "sessionFailure"
                ]
            }
        }),
    );

    AcpProviderIntegration {
        id: REGISTRY_ID.into(),
        client_capabilities_meta,
        tethys_commands: HashMap::from([
            ("model".into(), AgentCommandControl::Model),
            ("permissions".into(), AgentCommandControl::Permissions),
            ("config".into(), AgentCommandControl::Config),
            ("resume".into(), AgentCommandControl::Resume),
            ("clear".into(), AgentCommandControl::Clear),
        ]),
        session_update_handler: Some(Arc::new(map_session_update) as SessionUpdateHandler),
        config_options_handler: Some(Arc::new(apply_initial_config_options) as ConfigOptionsHandler),
        permission_metadata_handler: Some(
            Arc::new(map_permission_metadata) as PermissionMetadataHandler
        ),
        prompt_response_handler: Some(Arc::new(map_prompt_response) as PromptResponseHandler),
        ..Default::default()
    }
}

fn map_session_update(
    _session_id: &str,
    _prompt_request_id: Option<&str>,
    raw: &Value,
    events: &mut Vec<TurnEventBody>,
) -> Option<String> {
    match string_field(raw, &["sessionUpdate"]) {
        Some("subagent_spawned") => {
            let session_id = string_field(raw, &["subagentSessionId", "subagent_session_id"])?;
            events.retain(|event| !matches!(event, TurnEventBody::Unknown { .. }));
            events.push(TurnEventBody::ToolCallUpsert {
                tool_call_id: session_id.to_string(),
                patch: ToolCallPatch {
                    title: Some(
                        string_field(raw, &["name"])
                            .unwrap_or("Subagent")
                            .to_string(),
                    ),
                    kind: Some(ToolKind::Other),
                    status: Some(ToolCallStatus::Executing),
                    input: string_field(raw, &["task"]).map(str::to_string),
                    origin: Some(ToolOrigin::Subagent),
                    metadata: Some(raw.to_string()),
                    ..Default::default()
                },
            });
            return Some(session_id.to_string());
        }
        Some("subagent_state_update") => {
            let (Some(session_id), Some(state)) = (
                string_field(raw, &["subagentSessionId", "subagent_session_id"]),
                string_field(raw, &["state"]),
            ) else {
                return None;
            };
            let status = match state {
                "completed" => ToolCallStatus::Completed,
                "failed" | "cancelled" | "disconnected" => ToolCallStatus::Failed,
                _ => return None,
            };
            events.retain(|event| !matches!(event, TurnEventBody::Unknown { .. }));
            events.push(TurnEventBody::ToolCallUpsert {
                tool_call_id: session_id.to_string(),
                patch: ToolCallPatch {
                    status: Some(status),
                    metadata: Some(raw.to_string()),
                    ..Default::default()
                },
            });
            return None;
        }
        _ => {}
    }

    for event in events.iter_mut() {
        if let TurnEventBody::ConfigOptionsChanged { options } = event {
            apply_config_metadata(raw, options);
        }
    }

    let meta = provider_meta(raw);
    if let Some(meta) = meta {
        let metadata = serde_json::to_string(meta).ok();
        for event in events.iter_mut() {
            match event {
                TurnEventBody::ToolCallUpsert { patch, .. } => {
                    patch.metadata.clone_from(&metadata);
                    if let Some(parent) = claude_parent_tool(meta) {
                        patch.origin = Some(ToolOrigin::Subagent);
                        patch.parent_tool_call_id = Some(parent.to_string());
                    } else if let Some(origin) = claude_tool_origin(meta, patch.input.as_deref()) {
                        patch.origin = Some(origin);
                    }
                }
                TurnEventBody::SessionInfo(info) => apply_goal(meta, info),
                _ => {}
            }
        }

        if let Some(goal) = meta.get("goal") {
            if !events
                .iter()
                .any(|event| matches!(event, TurnEventBody::SessionInfo(_)))
            {
                events.push(TurnEventBody::SessionInfo(SessionInfo {
                    title: None,
                    updated_at: None,
                    goal: goal_patch(goal),
                    file_change_report: Patch::Unchanged,
                }));
            }
        }
    }

    if let Some(failure) = air_metadata(raw).and_then(|air| air.get("sessionFailure")) {
        events.push(session_failure_event(failure));
    }
    None
}

fn map_permission_metadata(raw: &Value, permission: &mut PermissionRequested) {
    let Some(meta) = provider_meta(raw).and_then(|meta| meta.get("permission")) else {
        return;
    };
    if let Some(title) = meta.get("title").and_then(Value::as_str) {
        permission.title = title.to_string();
    }
    if let Some(description) = meta.get("description").and_then(Value::as_str) {
        permission.description = Some(description.to_string());
    }
    permission.metadata = serde_json::to_string(meta).ok();
}

fn map_prompt_response(raw: &Value) -> Vec<TurnEventBody> {
    air_metadata(raw)
        .and_then(|air| air.get("sessionFailure"))
        .map(session_failure_event)
        .into_iter()
        .collect()
}

fn session_failure_event(failure: &Value) -> TurnEventBody {
    TurnEventBody::ProviderExtension(tethys_schema::provider_extension::ProviderExtension {
        provider_id: REGISTRY_ID.into(),
        method: "_meta.jetbrains.air.sessionFailure".into(),
        request_id: None,
        params: serde_json::to_string(failure).unwrap_or_else(|_| "{}".into()),
    })
}

fn apply_config_metadata(raw: &Value, options: &mut [ConfigOption]) {
    let Some(raw_options) = find_array(raw, &["configOptions", "config_options"]) else {
        return;
    };
    for option in options {
        let Some(raw_option) = raw_options.iter().find(|raw_option| {
            string_field(raw_option, &["id", "configId", "config_id"])
                .is_some_and(|id| id == option.id)
        }) else {
            continue;
        };
        let meta = provider_meta(raw_option).cloned();
        if option.category.as_deref() == Some("mode") {
            let metadata = crate::provider_integration::with_mode_roles(
                REGISTRY_ID,
                option,
                meta.unwrap_or_else(|| json!({})),
            );
            option.metadata = serde_json::to_string(&metadata).ok();
        } else if let Some(meta) = meta.as_ref() {
            option.metadata = serde_json::to_string(meta).ok();
        }
        let recommended = air_metadata(raw_option)
            .and_then(|air| air.get("recommendedValue"))
            .and_then(Value::as_str);
        if let Some(recommended) =
            recommended.filter(|value| option.values.iter().any(|id| id == value))
        {
            option.recommended_value = Some(recommended.to_string());
        }
    }
}

fn apply_initial_config_options(options: &mut [ConfigOption]) {
    for option in options {
        if option.category.as_deref() != Some("mode") {
            continue;
        }
        let metadata = option
            .metadata
            .as_deref()
            .map(|raw| serde_json::from_str(raw).unwrap_or_else(|_| Value::String(raw.to_string())))
            .unwrap_or_else(|| json!({}));
        let metadata = crate::provider_integration::with_mode_roles(REGISTRY_ID, option, metadata);
        option.metadata = serde_json::to_string(&metadata).ok();
    }
}

fn apply_goal(meta: &Value, info: &mut SessionInfo) {
    if let Some(goal) = meta.get("goal") {
        info.goal = goal_patch(goal);
    }
}

fn goal_patch(value: &Value) -> Patch<SessionGoal> {
    if value.is_null() {
        return Patch::Clear;
    }
    parse_goal(value)
        .map(Patch::Set)
        .unwrap_or(Patch::Unchanged)
}

fn parse_goal(value: &Value) -> Option<SessionGoal> {
    let objective = value.get("objective")?.as_str()?.to_string();
    let status = value.get("status")?.as_str()?.to_string();
    Some(SessionGoal {
        objective,
        status,
        iterations: value
            .get("iterations")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok()),
        last_reason: value
            .get("lastReason")
            .and_then(Value::as_str)
            .map(str::to_string),
        created_at: value.get("createdAt").and_then(|created_at| {
            created_at
                .as_str()
                .map(str::to_string)
                .or_else(|| created_at.as_u64().map(|value| value.to_string()))
        }),
        metadata: serde_json::to_string(value).unwrap_or_else(|_| "{}".into()),
    })
}

/// Where a Claude tool call came from, read from the tool's own name rather
/// than its display title (DESIGN.md `tool-origin-tag`): Claude names an MCP
/// tool `mcp__<server>__<tool>` and runs a skill through its `Skill` tool.
fn claude_tool_origin(meta: &Value, input: Option<&str>) -> Option<ToolOrigin> {
    let name = meta.get("claudeCode")?.get("toolName")?.as_str()?;
    if let Some(rest) = name.strip_prefix("mcp__") {
        let server = rest
            .split("__")
            .next()
            .filter(|server| !server.is_empty())?;
        return Some(ToolOrigin::Mcp {
            server: server.to_string(),
        });
    }
    if name == "Skill" {
        let input: Value = serde_json::from_str(input?).ok()?;
        let skill = string_field(&input, &["skill", "command", "name"])?;
        return Some(ToolOrigin::Skill {
            name: skill.trim_start_matches('/').to_string(),
        });
    }
    None
}

fn claude_parent_tool(meta: &Value) -> Option<&str> {
    meta.get("claudeCode")?.get("parentToolUseId")?.as_str()
}

fn air_metadata(value: &Value) -> Option<&Value> {
    provider_meta(value)?.get("jetbrains")?.get("air")
}

fn provider_meta(value: &Value) -> Option<&Value> {
    if let Some(meta) = value.get("_meta").or_else(|| value.get("meta")) {
        return Some(meta);
    }
    match value {
        Value::Object(object) => object.values().find_map(provider_meta),
        Value::Array(array) => array.iter().find_map(provider_meta),
        _ => None,
    }
}

fn find_array<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Vec<Value>> {
    if let Some(array) = keys.iter().find_map(|key| value.get(*key)?.as_array()) {
        return Some(array);
    }
    match value {
        Value::Object(object) => object.values().find_map(|child| find_array(child, keys)),
        Value::Array(array) => array.iter().find_map(|child| find_array(child, keys)),
        _ => None,
    }
}

fn string_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter().find_map(|key| value.get(*key)?.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map_update(raw: &Value, events: &mut Vec<TurnEventBody>) -> Option<String> {
        map_session_update("session", None, raw, events)
    }

    #[test]
    fn maps_recommended_values_permission_text_goals_and_failures() {
        let mut events = vec![TurnEventBody::ConfigOptionsChanged {
            options: vec![ConfigOption {
                id: "model".into(),
                name: "Model".into(),
                description: None,
                current_value: "sonnet".into(),
                values: vec!["sonnet".into(), "opus".into()],
                category: None,
                kind: None,
                value_options: vec![],
                recommended_value: None,
                metadata: None,
            }],
        }];
        let raw = json!({
            "sessionUpdate": "config_option_update",
            "configOptions": [{
                "id": "model",
                "_meta": {"jetbrains": {"air": {"recommendedValue": "opus"}}}
            }]
        });
        map_update(&raw, &mut events);
        let TurnEventBody::ConfigOptionsChanged { options } = &events[0] else {
            panic!("config event")
        };
        assert_eq!(options[0].recommended_value.as_deref(), Some("opus"));
        assert!(options[0]
            .metadata
            .as_deref()
            .unwrap()
            .contains("recommendedValue"));

        let mut permission = PermissionRequested {
            req_id: "p1".into(),
            title: "Tool permission".into(),
            description: None,
            subject: None,
            options: vec![],
            metadata: None,
        };
        map_permission_metadata(
            &json!({"_meta": {"permission": {"title": "Delete file", "description": "Removes it"}}}),
            &mut permission,
        );
        assert_eq!(permission.title, "Delete file");
        assert_eq!(permission.description.as_deref(), Some("Removes it"));

        let mut goal_events = Vec::new();
        map_update(
            &json!({"_meta": {"goal": {"objective": "Ship", "status": "active", "iterations": 2}}}),
            &mut goal_events,
        );
        assert!(matches!(
            &goal_events[0],
            TurnEventBody::SessionInfo(info) if matches!(&info.goal, Patch::Set(goal) if goal.objective == "Ship")
        ));

        let failure = map_prompt_response(&json!({
            "_meta": {"jetbrains": {"air": {"sessionFailure": {"id": "i1", "severity": "error"}}}}
        }));
        assert!(matches!(
            &failure[0],
            TurnEventBody::ProviderExtension(extension) if extension.params.contains("i1")
        ));
    }

    #[test]
    fn marks_claude_approval_modes_and_defaults_other_modes_to_working() {
        let mut events = vec![TurnEventBody::ConfigOptionsChanged {
            options: vec![ConfigOption {
                id: "mode".into(),
                name: "Mode".into(),
                description: None,
                current_value: "plan".into(),
                values: vec![
                    "plan".into(),
                    "acceptEdits".into(),
                    "bypassPermissions".into(),
                ],
                category: Some("mode".into()),
                kind: None,
                value_options: vec![
                    tethys_schema::thread::ConfigOptionValue {
                        id: "plan".into(),
                        name: "Plan".into(),
                        description: None,
                    },
                    tethys_schema::thread::ConfigOptionValue {
                        id: "acceptEdits".into(),
                        name: "Accept edits".into(),
                        description: None,
                    },
                    tethys_schema::thread::ConfigOptionValue {
                        id: "bypassPermissions".into(),
                        name: "Bypass permissions".into(),
                        description: None,
                    },
                ],
                recommended_value: None,
                metadata: None,
            }],
        }];
        let raw = json!({
            "sessionUpdate": "config_option_update",
            "configOptions": [{ "id": "mode" }]
        });
        let handler = descriptor().session_update_handler.expect("handler");
        handler("session", None, &raw, &mut events);

        let TurnEventBody::ConfigOptionsChanged { options } = &events[0] else {
            panic!("config event")
        };
        let metadata: Value = serde_json::from_str(options[0].metadata.as_deref().unwrap_or("{}"))
            .expect("mode metadata");
        assert_eq!(
            metadata["tethysModeRoles"]["acceptEdits"],
            json!({ "kind": "approval", "level": "auto-edit" })
        );
        assert_eq!(
            metadata["tethysModeRoles"]["bypassPermissions"],
            json!({ "kind": "approval", "level": "yolo" })
        );
        assert_eq!(
            metadata["tethysModeRoles"]["plan"],
            json!({ "kind": "working" })
        );
    }

    #[test]
    fn annotates_modes_before_a_new_thread_is_prepared() {
        let descriptor = descriptor();
        let handler = descriptor
            .config_options_handler
            .expect("Claude config option handler");
        let mut options = vec![ConfigOption {
            id: "mode".into(),
            name: "Mode".into(),
            description: None,
            current_value: "default".into(),
            values: vec!["default".into(), "acceptEdits".into()],
            category: Some("mode".into()),
            kind: None,
            value_options: vec![
                tethys_schema::thread::ConfigOptionValue {
                    id: "default".into(),
                    name: "Default".into(),
                    description: None,
                },
                tethys_schema::thread::ConfigOptionValue {
                    id: "acceptEdits".into(),
                    name: "Accept edits".into(),
                    description: None,
                },
            ],
            recommended_value: None,
            metadata: None,
        }];

        handler(&mut options);

        let metadata: Value = serde_json::from_str(options[0].metadata.as_deref().unwrap_or("{}"))
            .expect("mode metadata");
        assert_eq!(
            metadata["tethysModeRoles"]["acceptEdits"],
            json!({ "kind": "approval", "level": "auto-edit" })
        );
        assert_eq!(
            metadata["tethysModeRoles"]["default"],
            json!({ "kind": "approval", "level": "supervised" })
        );
    }

    fn tool_upsert(input: Option<&str>) -> Vec<TurnEventBody> {
        vec![TurnEventBody::ToolCallUpsert {
            tool_call_id: "t1".into(),
            patch: ToolCallPatch {
                input: input.map(str::to_string),
                ..Default::default()
            },
        }]
    }

    fn origin_of(events: &[TurnEventBody]) -> Option<ToolOrigin> {
        match &events[0] {
            TurnEventBody::ToolCallUpsert { patch, .. } => patch.origin.clone(),
            _ => None,
        }
    }

    #[test]
    fn names_the_mcp_server_and_skill_behind_a_tool_call() {
        let handler = descriptor().session_update_handler.expect("handler");

        let mut events = tool_upsert(None);
        handler(
            "session",
            None,
            &json!({"_meta": {"claudeCode": {"toolName": "mcp__github__create_issue"}}}),
            &mut events,
        );
        assert_eq!(
            origin_of(&events),
            Some(ToolOrigin::Mcp {
                server: "github".into()
            })
        );

        let mut events = tool_upsert(Some(r#"{"skill":"pdf"}"#));
        handler(
            "session",
            None,
            &json!({"_meta": {"claudeCode": {"toolName": "Skill"}}}),
            &mut events,
        );
        assert_eq!(
            origin_of(&events),
            Some(ToolOrigin::Skill { name: "pdf".into() })
        );

        let mut events = tool_upsert(None);
        handler(
            "session",
            None,
            &json!({"_meta": {"claudeCode": {"toolName": "Edit"}}}),
            &mut events,
        );
        assert_eq!(origin_of(&events), None);
    }

    #[test]
    fn maps_parent_tool_attribution_without_touching_standard_updates() {
        let mut events = vec![TurnEventBody::ToolCallUpsert {
            tool_call_id: "child".into(),
            patch: Default::default(),
        }];
        map_update(
            &json!({"_meta": {"claudeCode": {"parentToolUseId": "parent"}}}),
            &mut events,
        );
        assert!(matches!(
            &events[0],
            TurnEventBody::ToolCallUpsert { patch, .. }
                if patch.origin == Some(ToolOrigin::Subagent)
                    && patch.parent_tool_call_id.as_deref() == Some("parent")
        ));
    }

    #[test]
    fn maps_negotiated_native_subagent_lifecycle() {
        let mut events = vec![TurnEventBody::Unknown {
            raw: "unsupported native subagent update".into(),
        }];
        let child = map_update(
            &json!({
                "sessionUpdate": "subagent_spawned",
                "subagentSessionId": "child-session",
                "name": "Explore",
                "task": "Find the relevant module",
                "capabilities": {}
            }),
            &mut events,
        );
        assert_eq!(child.as_deref(), Some("child-session"));
        assert!(matches!(
            &events[0],
            TurnEventBody::ToolCallUpsert { tool_call_id, patch }
                if tool_call_id == "child-session"
                    && patch.title.as_deref() == Some("Explore")
                    && patch.input.as_deref() == Some("Find the relevant module")
                    && patch.origin == Some(ToolOrigin::Subagent)
                    && patch.status == Some(ToolCallStatus::Executing)
        ));

        let mut terminal = Vec::new();
        map_update(
            &json!({
                "sessionUpdate": "subagent_state_update",
                "subagentSessionId": "child-session",
                "state": "completed"
            }),
            &mut terminal,
        );
        assert!(matches!(
            &terminal[0],
            TurnEventBody::ToolCallUpsert { tool_call_id, patch }
                if tool_call_id == "child-session"
                    && patch.status == Some(ToolCallStatus::Completed)
        ));
    }
}
