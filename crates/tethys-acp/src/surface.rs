//! The default Tethys surface for a tool call, read from the shape of its
//! input. ACP's `kind` cannot tell a todo write, a question, or a web search
//! from other `think` / `other` / `fetch` calls, but those tools take the same
//! input across agents, so any Provider gets the todo, question, and web search
//! surfaces without an adapter. A Provider adapter that names a surface itself
//! (by tool name) wins; this only fills what is still unnamed.

use serde_json::Value;
use tethys_schema::thread::{
    PlanContent, PlanEntry, PlanEntryPriority, PlanEntryStatus, ToolKind, ToolSurface,
    TurnEventBody,
};

/// Names the surface of every unnamed tool call in `events`, and turns a todo
/// write into the ACP plan it stands for when the batch carries no plan of its
/// own, so the todo card and pin render for agents that never send `plan`.
pub fn infer_tool_surfaces(events: &mut Vec<TurnEventBody>) {
    let has_plan = events
        .iter()
        .any(|event| matches!(event, TurnEventBody::PlanUpsert { .. }));
    let mut plans = Vec::new();
    for event in events.iter_mut() {
        let TurnEventBody::ToolCallUpsert { patch, .. } = event else {
            continue;
        };
        let Some(input) = patch
            .input
            .as_deref()
            .and_then(|input| serde_json::from_str::<Value>(input).ok())
        else {
            continue;
        };
        if patch.surface.is_none() {
            patch.surface = surface_from_input(patch.kind, &input);
        }
        if patch.surface == Some(ToolSurface::Todo) && !has_plan {
            plans.extend(todo_plan(&input));
        }
    }
    events.extend(plans.into_iter().map(|plan| TurnEventBody::PlanUpsert {
        plan_id: "default".into(),
        plan,
    }));
}

/// A `query` alone is a web search only on a call that says it reaches the
/// network (`fetch`) or says nothing more (`other`). An update that omits its
/// kind is not guessed at, so a code search's later update stays a search.
fn surface_from_input(kind: Option<ToolKind>, input: &Value) -> Option<ToolSurface> {
    let web = matches!(kind, Some(ToolKind::Fetch | ToolKind::Other));
    if input.get("todos").is_some_and(Value::is_array) {
        Some(ToolSurface::Todo)
    } else if input.get("questions").is_some_and(Value::is_array) {
        Some(ToolSurface::Question)
    } else if web && input.get("query").is_some_and(Value::is_string) && input.get("url").is_none()
    {
        Some(ToolSurface::WebSearch)
    } else {
        None
    }
}

/// A todo tool's `todos: [{content, status, priority?}]` as an ACP plan.
fn todo_plan(input: &Value) -> Option<PlanContent> {
    let entries = input
        .get("todos")?
        .as_array()?
        .iter()
        .filter_map(|todo| {
            let status = match todo.get("status")?.as_str()? {
                "pending" => PlanEntryStatus::Pending,
                "in_progress" => PlanEntryStatus::InProgress,
                "completed" => PlanEntryStatus::Completed,
                _ => return None,
            };
            let priority = match todo.get("priority").and_then(Value::as_str) {
                Some("high") => PlanEntryPriority::High,
                Some("low") => PlanEntryPriority::Low,
                _ => PlanEntryPriority::Medium,
            };
            Some(PlanEntry {
                content: todo.get("content")?.as_str()?.to_string(),
                priority,
                status,
            })
        })
        .collect::<Vec<_>>();
    (!entries.is_empty()).then_some(PlanContent { entries })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tethys_schema::thread::ToolCallPatch;

    fn upsert(input: &str, surface: Option<ToolSurface>) -> Vec<TurnEventBody> {
        vec![TurnEventBody::ToolCallUpsert {
            tool_call_id: "call-1".into(),
            patch: ToolCallPatch {
                input: Some(input.into()),
                kind: Some(ToolKind::Fetch),
                surface,
                ..Default::default()
            },
        }]
    }

    fn surface(events: &[TurnEventBody]) -> Option<ToolSurface> {
        match &events[0] {
            TurnEventBody::ToolCallUpsert { patch, .. } => patch.surface,
            _ => None,
        }
    }

    #[test]
    fn a_todo_write_becomes_a_todo_surface_and_a_plan() {
        let mut events = upsert(
            r#"{"todos":[{"content":"Write tests","status":"in_progress","priority":"high"},{"content":"Ship","status":"pending"}]}"#,
            None,
        );
        infer_tool_surfaces(&mut events);
        assert_eq!(surface(&events), Some(ToolSurface::Todo));
        let TurnEventBody::PlanUpsert { plan, .. } = &events[1] else {
            panic!("plan");
        };
        assert_eq!(plan.entries.len(), 2);
        assert_eq!(plan.entries[0].status, PlanEntryStatus::InProgress);
        assert_eq!(plan.entries[1].priority, PlanEntryPriority::Medium);
    }

    #[test]
    fn a_plan_the_agent_sent_is_not_duplicated() {
        let mut events = upsert(r#"{"todos":[{"content":"a","status":"pending"}]}"#, None);
        events.push(TurnEventBody::PlanUpsert {
            plan_id: "default".into(),
            plan: PlanContent { entries: vec![] },
        });
        infer_tool_surfaces(&mut events);
        assert_eq!(events.len(), 2);
    }

    #[test]
    fn names_question_and_web_search_and_keeps_an_adapter_surface() {
        let inferred = |input: &str| {
            let mut events = upsert(input, None);
            infer_tool_surfaces(&mut events);
            surface(&events)
        };
        assert_eq!(
            inferred(r#"{"questions":[{"question":"Which?"}]}"#),
            Some(ToolSurface::Question)
        );
        assert_eq!(
            inferred(r#"{"query":"acp spec"}"#),
            Some(ToolSurface::WebSearch)
        );
        assert_eq!(inferred(r#"{"url":"https://x","query":"q"}"#), None);
        assert_eq!(inferred(r#"{"command":"ls"}"#), None);

        let mut events = upsert(r#"{"query":"acp"}"#, Some(ToolSurface::Search));
        infer_tool_surfaces(&mut events);
        assert_eq!(surface(&events), Some(ToolSurface::Search));

        // A code search, or an update that omits its kind, is not a web search.
        for kind in [Some(ToolKind::Search), None] {
            let mut events = vec![TurnEventBody::ToolCallUpsert {
                tool_call_id: "grep".into(),
                patch: ToolCallPatch {
                    input: Some(r#"{"query":"TODO"}"#.into()),
                    kind,
                    ..Default::default()
                },
            }];
            infer_tool_surfaces(&mut events);
            assert_eq!(surface(&events), None);
        }
    }
}
