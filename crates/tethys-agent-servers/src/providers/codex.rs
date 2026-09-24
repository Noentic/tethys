use serde_json::{json, Map, Value};
use tethys_acp::client::{
    AcpProviderIntegration, ConfigOptionsHandler, PermissionMetadataHandler, PromptMetadataHandler,
    PromptResponseHandler, SessionUpdateHandler,
};
use tethys_schema::agents::{EnvVarInput, LaunchSpecInput};
use tethys_schema::thread::{
    ConfigOption, FileChangeReport, Patch, PermissionRequested, SessionGoal, SessionInfo,
    ToolCallPatch, ToolCallStatus, ToolKind, ToolOrigin, TurnEventBody,
};

pub const REGISTRY_ID: &str = "codex-acp";

pub fn descriptor() -> AcpProviderIntegration {
    let mut client_capabilities_meta = Map::new();
    client_capabilities_meta.insert(
        "jetbrains".into(),
        json!({
            "air": {
                "version": 1,
                "capabilities": [
                    "agentFileChangeReport",
                    "asyncTasks",
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
        gateway_auth: true,
        extension_methods: vec![
            "_session/goal".into(),
            "_session/steering".into(),
            "_session/async_task/stop".into(),
        ],
        session_update_handler: Some(
            std::sync::Arc::new(map_session_update) as SessionUpdateHandler
        ),
        config_options_handler: Some(
            std::sync::Arc::new(apply_config_options) as ConfigOptionsHandler
        ),
        permission_metadata_handler: Some(
            std::sync::Arc::new(apply_permission_metadata) as PermissionMetadataHandler
        ),
        prompt_response_handler: Some(
            std::sync::Arc::new(map_prompt_response) as PromptResponseHandler
        ),
        prompt_metadata_handler: Some(
            std::sync::Arc::new(file_change_report_request) as PromptMetadataHandler
        ),
        ..Default::default()
    }
}

pub fn system_launch_spec() -> Option<LaunchSpecInput> {
    Some(LaunchSpecInput {
        program: which::which("codex-acp")
            .ok()?
            .to_string_lossy()
            .into_owned(),
        args: Vec::new(),
        cwd: None,
        env: Vec::<EnvVarInput>::new(),
    })
}

pub fn setup_note() -> Option<String> {
    (system_launch_spec().is_none() && which::which("codex").is_ok()).then(|| {
        "The Codex CLI is installed, but it is not an ACP server. Tethys can reuse codex-acp from PATH; otherwise the adapter package is required and includes its own @openai/codex dependency, which may install a second runtime copy. Tethys does not install @openai/codex globally.".to_string()
    })
}

fn file_change_report_request(
    _session_id: &str,
    request_id: &str,
    agent_meta: Option<&Map<String, Value>>,
) -> Option<Map<String, Value>> {
    let capabilities = agent_meta?
        .get("jetbrains")?
        .get("air")?
        .get("capabilities")?
        .as_array()?;
    if !capabilities
        .iter()
        .any(|value| value.as_str() == Some("agentFileChangeReport"))
    {
        return None;
    }

    Some(Map::from_iter([(
        "jetbrains".into(),
        json!({
            "air": {
                "agentFileChangeReportRequest": {
                    "version": 1,
                    "requestId": request_id
                }
            }
        }),
    )]))
}

fn map_session_update(
    _session_id: &str,
    expected_request_id: Option<&str>,
    raw: &Value,
    events: &mut Vec<TurnEventBody>,
) -> Option<String> {
    match raw.get("sessionUpdate").and_then(Value::as_str) {
        Some("async_task_spawned") => {
            let async_task_id = string_field(raw, &["asyncTaskId", "async_task_id"])?;
            let tool_call_id =
                string_field(raw, &["toolCallId", "tool_call_id"]).unwrap_or(async_task_id);
            let can_stop = raw.get("canStop").and_then(Value::as_bool) == Some(true);
            events.retain(|event| !matches!(event, TurnEventBody::Unknown { .. }));
            events.push(TurnEventBody::ToolCallUpsert {
                tool_call_id: tool_call_id.to_owned(),
                patch: ToolCallPatch {
                    title: Some(
                        string_field(raw, &["name"])
                            .or_else(|| string_field(raw, &["taskType", "task_type"]))
                            .unwrap_or("Background task")
                            .to_owned(),
                    ),
                    kind: Some(ToolKind::Execute),
                    status: Some(ToolCallStatus::Executing),
                    async_task_id: can_stop.then(|| async_task_id.to_owned()),
                    metadata: Some(raw.to_string()),
                    ..Default::default()
                },
            });
        }
        Some("async_task_state_update") => {
            let async_task_id = string_field(raw, &["asyncTaskId", "async_task_id"])?;
            let state = string_field(raw, &["state"])?;
            let status = match state {
                "completed" => ToolCallStatus::Completed,
                "failed" => ToolCallStatus::Failed,
                "stopped" => ToolCallStatus::Cancelled,
                _ => return None,
            };
            let tool_call_id =
                string_field(raw, &["toolCallId", "tool_call_id"]).unwrap_or(async_task_id);
            events.retain(|event| !matches!(event, TurnEventBody::Unknown { .. }));
            events.push(TurnEventBody::ToolCallUpsert {
                tool_call_id: tool_call_id.to_owned(),
                patch: ToolCallPatch {
                    status: Some(status),
                    metadata: Some(raw.to_string()),
                    ..Default::default()
                },
            });
        }
        Some("subagent_spawned") => {
            let child_session_id =
                string_field(raw, &["subagentSessionId", "subagent_session_id"])?;
            events.retain(|event| !matches!(event, TurnEventBody::Unknown { .. }));
            events.push(TurnEventBody::ToolCallUpsert {
                tool_call_id: child_session_id.to_owned(),
                patch: ToolCallPatch {
                    title: Some(
                        string_field(raw, &["name"])
                            .unwrap_or("Subagent")
                            .to_owned(),
                    ),
                    kind: Some(ToolKind::Other),
                    status: Some(ToolCallStatus::Executing),
                    input: string_field(raw, &["task"]).map(str::to_owned),
                    origin: Some(ToolOrigin::Subagent),
                    metadata: Some(raw.to_string()),
                    ..Default::default()
                },
            });
            return Some(child_session_id.to_owned());
        }
        Some("subagent_state_update") => {
            let child_session_id =
                string_field(raw, &["subagentSessionId", "subagent_session_id"])?;
            let state = string_field(raw, &["state"])?;
            let status = match state {
                "completed" => ToolCallStatus::Completed,
                "failed" => ToolCallStatus::Failed,
                "cancelled" | "disconnected" => ToolCallStatus::Cancelled,
                _ => return None,
            };
            events.retain(|event| !matches!(event, TurnEventBody::Unknown { .. }));
            events.push(TurnEventBody::ToolCallUpsert {
                tool_call_id: child_session_id.to_owned(),
                patch: ToolCallPatch {
                    status: Some(status),
                    metadata: Some(raw.to_string()),
                    ..Default::default()
                },
            });
        }
        _ => {}
    }

    let meta = raw.get("_meta");
    let goal = goal_patch(meta.and_then(|meta| meta.get("goal")));
    let report = meta
        .and_then(|meta| meta.get("jetbrains"))
        .and_then(|meta| meta.get("air"))
        .and_then(|meta| meta.get("agentFileChangeReport"));
    let valid_report = report.and_then(|report| {
        let request_id = report.get("requestId")?.as_str()?;
        if expected_request_id != Some(request_id)
            || report.get("version")?.as_u64()? != 1
            || report.get("status")?.as_str()? != "reported"
            || serde_json::to_vec(report).ok()?.len() > 256 * 1024
        {
            return None;
        }
        let paths = report.get("paths")?.as_array()?;
        if paths.len() > 1024 {
            return None;
        }
        let paths = paths
            .iter()
            .map(|path| {
                path.as_str()
                    .filter(|path| path.len() <= 4096)
                    .map(str::to_owned)
            })
            .collect::<Option<Vec<_>>>()?;
        let uncertainty = report
            .get("uncertainty")
            .and_then(Value::as_str)
            .map(str::to_owned);
        if uncertainty.as_ref().is_some_and(|text| text.len() > 2000) {
            return None;
        }
        Some(FileChangeReport {
            request_id: request_id.to_owned(),
            paths,
            declared_complete: report.get("declaredComplete")?.as_bool()?,
            truncated: report.get("truncated")?.as_bool()?,
            uncertainty,
        })
    });

    let has_report = valid_report.is_some();
    if !matches!(&goal, Patch::Unchanged) || has_report {
        let info = SessionInfo {
            title: raw.get("title").and_then(Value::as_str).map(str::to_owned),
            updated_at: raw
                .get("updatedAt")
                .and_then(Value::as_str)
                .map(str::to_owned),
            goal,
            file_change_report: valid_report.map(Patch::Set).unwrap_or(Patch::Unchanged),
        };
        if let Some(existing) = events.iter_mut().find_map(|event| match event {
            TurnEventBody::SessionInfo(info) => Some(info),
            _ => None,
        }) {
            if !matches!(&info.goal, Patch::Unchanged) {
                existing.goal = info.goal;
            }
            if !matches!(&info.file_change_report, Patch::Unchanged) {
                existing.file_change_report = info.file_change_report;
            }
        } else {
            events.push(TurnEventBody::SessionInfo(info));
        }
    }
    if has_report {
        events.retain(|event| !matches!(event, TurnEventBody::Unknown { .. }));
    }
    for event in events.iter_mut() {
        if let TurnEventBody::ConfigOptionsChanged { options } = event {
            apply_config_options(options);
        }
    }
    if let Some(failure) = air_metadata(raw).and_then(|air| air.get("sessionFailure")) {
        events.push(session_failure_event(failure));
    }
    None
}

fn string_field<'a>(raw: &'a Value, names: &[&str]) -> Option<&'a str> {
    names
        .iter()
        .find_map(|name| raw.get(*name).and_then(Value::as_str))
}

fn air_metadata(raw: &Value) -> Option<&serde_json::Map<String, Value>> {
    raw.get("_meta")?.get("jetbrains")?.get("air")?.as_object()
}

fn session_failure_event(failure: &Value) -> TurnEventBody {
    TurnEventBody::ProviderExtension(tethys_schema::provider_extension::ProviderExtension {
        provider_id: REGISTRY_ID.into(),
        method: "_meta.jetbrains.air.sessionFailure".into(),
        request_id: None,
        params: failure.to_string(),
    })
}

fn map_prompt_response(raw: &Value) -> Vec<TurnEventBody> {
    air_metadata(raw)
        .and_then(|air| air.get("sessionFailure"))
        .map(session_failure_event)
        .into_iter()
        .collect()
}

fn apply_config_options(options: &mut [ConfigOption]) {
    for option in options {
        let metadata = option
            .metadata
            .as_deref()
            .and_then(|raw| serde_json::from_str::<Value>(raw).ok());
        let recommended = metadata
            .as_ref()
            .and_then(|meta| meta.get("jetbrains"))
            .and_then(|meta| meta.get("air"))
            .and_then(|air| air.get("recommendedValue"))
            .and_then(Value::as_str);
        if let Some(recommended) =
            recommended.filter(|value| option.values.iter().any(|current| current == value))
        {
            option.recommended_value = Some(recommended.to_owned());
        }
    }
}

fn apply_permission_metadata(raw: &Value, permission: &mut PermissionRequested) {
    if let Some(meta) = raw
        .get("_meta")
        .and_then(|meta| meta.get("permission"))
        .filter(|meta| meta.get("version").and_then(Value::as_u64) == Some(1))
    {
        if let Some(title) = meta
            .get("title")
            .and_then(Value::as_str)
            .filter(|title| !title.trim().is_empty() && title.len() <= 256)
        {
            permission.title = title.to_owned();
        }
        permission.description = meta
            .get("description")
            .and_then(Value::as_str)
            .filter(|description| description.len() <= 2000)
            .map(str::to_owned);
        permission.metadata = Some(meta.to_string());
    }

    let Some(raw_options) = raw.get("options").and_then(Value::as_array) else {
        return;
    };
    for option in &mut permission.options {
        let Some(raw_option) = raw_options.iter().find(|raw_option| {
            string_field(raw_option, &["optionId", "option_id"])
                .is_some_and(|id| id == option.option_id)
        }) else {
            continue;
        };
        let Some(meta) = raw_option
            .get("_meta")
            .and_then(|meta| meta.get("permission"))
            .filter(|meta| meta.get("version").and_then(Value::as_u64) == Some(1))
        else {
            continue;
        };
        option.description = meta
            .get("description")
            .and_then(Value::as_str)
            .filter(|description| description.len() <= 2000)
            .map(str::to_owned);
        option.metadata = raw_option
            .get("_meta")
            .map(Value::to_string)
            .filter(|metadata| metadata.len() <= 16 * 1024);
    }
}

fn goal_patch(value: Option<&Value>) -> Patch<SessionGoal> {
    let Some(value) = value else {
        return Patch::Unchanged;
    };
    if value.is_null() {
        return Patch::Clear;
    }
    let (Some(objective), Some(status)) = (
        value.get("objective").and_then(Value::as_str),
        value.get("status").and_then(Value::as_str),
    ) else {
        return Patch::Unchanged;
    };
    Patch::Set(SessionGoal {
        objective: objective.to_owned(),
        status: status.to_owned(),
        iterations: value
            .get("iterations")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok()),
        last_reason: value
            .get("lastReason")
            .and_then(Value::as_str)
            .map(str::to_owned),
        created_at: value
            .get("createdAt")
            .and_then(Value::as_u64)
            .map(|value| value.to_string()),
        metadata: value.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requests_file_reports_only_after_agent_negotiates_them() {
        let handler = descriptor().prompt_metadata_handler.expect("handler");
        assert!(handler("s", "r1", None).is_none());
        assert!(handler(
            "s",
            "r1",
            Some(&Map::from_iter([(
                "jetbrains".into(),
                json!({ "air": { "capabilities": ["sessionFailure"] } }),
            )]))
        )
        .is_none());
        assert_eq!(
            handler(
                "s",
                "r1",
                Some(&Map::from_iter([(
                    "jetbrains".into(),
                    json!({ "air": { "capabilities": ["agentFileChangeReport"] } }),
                )]))
            )
            .expect("request")["jetbrains"]["air"]["agentFileChangeReportRequest"]["requestId"],
            "r1"
        );
    }

    #[test]
    fn accepts_only_current_valid_file_report_and_preserves_goal_snapshot() {
        let raw = json!({
            "sessionUpdate": "session_info_update",
            "_meta": {
                "goal": { "objective": "Ship", "status": "active", "iterations": 2 },
                "jetbrains": { "air": { "agentFileChangeReport": {
                    "version": 1,
                    "requestId": "turn-1",
                    "status": "reported",
                    "paths": ["/workspace/src/lib.rs"],
                    "declaredComplete": false,
                    "truncated": false,
                    "uncertainty": "Shell edits may be absent."
                } } }
            }
        });
        let mut events = vec![TurnEventBody::Unknown {
            raw: raw.to_string(),
        }];
        map_session_update("s", Some("turn-1"), &raw, &mut events);
        assert!(matches!(
            &events[..],
            [TurnEventBody::SessionInfo(info)]
                if matches!(&info.file_change_report, Patch::Set(report) if report.paths == ["/workspace/src/lib.rs"])
                    && matches!(&info.goal, Patch::Set(goal) if goal.objective == "Ship")
        ));

        let mut stale = vec![TurnEventBody::Unknown {
            raw: raw.to_string(),
        }];
        map_session_update("s", Some("turn-2"), &raw, &mut stale);
        assert!(matches!(stale[0], TurnEventBody::Unknown { .. }));
    }

    #[test]
    fn maps_background_task_lifecycle_and_native_subagent_identity() {
        let mut events = vec![TurnEventBody::Unknown { raw: "raw".into() }];
        map_session_update(
            "root",
            None,
            &json!({
                "sessionUpdate": "async_task_spawned",
                "asyncTaskId": "root:task-1",
                "toolCallId": "task-1",
                "taskType": "shell",
                "canStop": true,
                "showInTranscript": false
            }),
            &mut events,
        );
        assert!(matches!(
            &events[..],
            [TurnEventBody::ToolCallUpsert { tool_call_id, patch }]
                if tool_call_id == "task-1"
                    && patch.async_task_id.as_deref() == Some("root:task-1")
                    && patch.status == Some(ToolCallStatus::Executing)
        ));

        let mut stopped = vec![TurnEventBody::Unknown { raw: "raw".into() }];
        map_session_update(
            "root",
            None,
            &json!({
                "sessionUpdate": "async_task_state_update",
                "asyncTaskId": "root:task-1",
                "toolCallId": "task-1",
                "state": "stopped"
            }),
            &mut stopped,
        );
        assert!(matches!(
            &stopped[..],
            [TurnEventBody::ToolCallUpsert { patch, .. }]
                if patch.status == Some(ToolCallStatus::Cancelled)
        ));

        let mut spawned = vec![TurnEventBody::Unknown { raw: "raw".into() }];
        let child = map_session_update(
            "root",
            None,
            &json!({
                "sessionUpdate": "subagent_spawned",
                "subagentSessionId": "child-1",
                "name": "Research",
                "task": "Inspect the call sites"
            }),
            &mut spawned,
        );
        assert_eq!(child.as_deref(), Some("child-1"));
        assert!(matches!(
            &spawned[..],
            [TurnEventBody::ToolCallUpsert { tool_call_id, patch }]
                if tool_call_id == "child-1"
                    && patch.origin == Some(ToolOrigin::Subagent)
                    && patch.input.as_deref() == Some("Inspect the call sites")
        ));
    }

    #[test]
    fn applies_recommended_values_and_permission_presentation_metadata() {
        let mut options = vec![ConfigOption {
            id: "reasoning_effort".into(),
            name: "Reasoning".into(),
            description: None,
            current_value: "medium".into(),
            values: vec!["low".into(), "medium".into(), "high".into()],
            category: None,
            kind: None,
            value_options: Vec::new(),
            recommended_value: None,
            metadata: Some(
                json!({
                    "jetbrains": {"air": {"recommendedValue": "high"}}
                })
                .to_string(),
            ),
        }];
        apply_config_options(&mut options);
        assert_eq!(options[0].recommended_value.as_deref(), Some("high"));

        let mut permission = PermissionRequested {
            req_id: "r1".into(),
            title: "Run command".into(),
            description: None,
            subject: None,
            options: vec![tethys_schema::thread::PermOption {
                option_id: "allow_session".into(),
                name: "Allow for this session".into(),
                kind: Some("allow_always".into()),
                description: None,
                metadata: None,
            }],
            metadata: None,
        };
        apply_permission_metadata(
            &json!({
                "_meta": {"permission": {
                    "version": 1,
                    "title": "Allow this command?",
                    "description": "Codex needs permission to run it."
                }},
                "options": [{
                    "optionId": "allow_session",
                    "_meta": {"permission": {
                        "version": 1,
                        "description": "Remember this choice for this session."
                    }}
                }]
            }),
            &mut permission,
        );
        assert_eq!(permission.title, "Allow this command?");
        assert_eq!(
            permission.options[0].description.as_deref(),
            Some("Remember this choice for this session.")
        );
    }
}
