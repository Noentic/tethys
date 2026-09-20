//! Entry materialization: keep the latest state per message, tool call, plan,
//! terminal, permission, and error (architecture §12 `entries`).

use tethys_schema::thread::{Entry, Patch, ToolCallContent, ToolCallPatch, TurnEventBody};

/// Apply one event to the entry list. Returns `true` when `entries` changed.
///
/// Replayed events may only create entries that do not exist yet; mutations of
/// already-materialized entries are skipped so resume never duplicates or
/// rewinds history (D12).
pub(crate) fn apply_event(entries: &mut Vec<Entry>, event: &TurnEventBody, replayed: bool) -> bool {
    match event {
        TurnEventBody::MessageChunk(chunk) => {
            let message_id = &chunk.message_id;
            let role = chunk.role;
            let block = &chunk.block;
            if replayed && find_mut(entries, message_id).is_some() {
                return false;
            }
            match find_mut(entries, message_id) {
                Some(Entry::Message { blocks, .. }) => {
                    blocks.push(block.clone());
                    true
                }
                Some(_) => false,
                None => {
                    entries.push(Entry::Message {
                        message_id: message_id.clone(),
                        role,
                        blocks: vec![block.clone()],
                    });
                    true
                }
            }
        }
        TurnEventBody::MessageUpsert(upsert) => {
            let message_id = &upsert.message_id;
            let role = upsert.role;
            let content = &upsert.content;
            if replayed && find_mut(entries, message_id).is_some() {
                return false;
            }
            let replacement = match content {
                Patch::Unchanged => None,
                Patch::Clear => Some(Vec::new()),
                Patch::Set(blocks) => Some(blocks.clone()),
            };
            match find_mut(entries, message_id) {
                Some(Entry::Message {
                    blocks,
                    role: existing_role,
                    ..
                }) => {
                    *existing_role = role;
                    if let Some(replacement) = replacement {
                        *blocks = replacement;
                    }
                    true
                }
                Some(_) => false,
                None => {
                    entries.push(Entry::Message {
                        message_id: message_id.clone(),
                        role,
                        blocks: replacement.unwrap_or_default(),
                    });
                    true
                }
            }
        }
        TurnEventBody::ToolCallUpsert {
            tool_call_id,
            patch,
        } => {
            if replayed && find_mut(entries, tool_call_id).is_some() {
                return false;
            }
            match find_mut(entries, tool_call_id) {
                Some(Entry::ToolCall {
                    patch: existing, ..
                }) => {
                    merge_tool_call(existing, patch);
                    true
                }
                Some(_) => false,
                None => {
                    entries.push(Entry::ToolCall {
                        tool_call_id: tool_call_id.clone(),
                        patch: patch.clone(),
                    });
                    true
                }
            }
        }
        TurnEventBody::ToolCallContentChunk { tool_call_id, item } => {
            if replayed && find_mut(entries, tool_call_id).is_some() {
                return false;
            }
            let Some(Entry::ToolCall { patch, .. }) = find_mut(entries, tool_call_id) else {
                return false;
            };
            let text = match item {
                ToolCallContent::Text(text) => text.clone(),
                ToolCallContent::Diff { patch, .. } => patch.clone(),
                ToolCallContent::Terminal { .. } | ToolCallContent::Unknown(_) => return false,
            };
            match &mut patch.output {
                Some(output) => output.push_str(&text),
                None => patch.output = Some(text),
            }
            true
        }
        TurnEventBody::PlanUpsert { plan_id, plan } => {
            if replayed && find_mut(entries, plan_id).is_some() {
                return false;
            }
            match find_mut(entries, plan_id) {
                Some(Entry::Plan { plan: existing, .. }) => {
                    *existing = plan.clone();
                    true
                }
                Some(_) => false,
                None => {
                    entries.push(Entry::Plan {
                        plan_id: plan_id.clone(),
                        plan: plan.clone(),
                    });
                    true
                }
            }
        }
        TurnEventBody::TerminalUpsert { terminal_id, patch } => {
            if replayed && find_mut(entries, terminal_id).is_some() {
                return false;
            }
            let output = match patch {
                Patch::Unchanged => None,
                Patch::Clear => Some(String::new()),
                Patch::Set(text) => Some(text.clone()),
            };
            match find_mut(entries, terminal_id) {
                Some(Entry::Terminal {
                    output: existing, ..
                }) => {
                    if let Some(output) = output {
                        *existing = output;
                    }
                    true
                }
                Some(_) => false,
                None => {
                    entries.push(Entry::Terminal {
                        terminal_id: terminal_id.clone(),
                        output: output.unwrap_or_default(),
                    });
                    true
                }
            }
        }
        TurnEventBody::TerminalOutputChunk { terminal_id, bytes } => {
            if replayed && find_mut(entries, terminal_id).is_some() {
                return false;
            }
            match find_mut(entries, terminal_id) {
                Some(Entry::Terminal { output, .. }) => {
                    output.push_str(bytes);
                    true
                }
                Some(_) => false,
                None => {
                    entries.push(Entry::Terminal {
                        terminal_id: terminal_id.clone(),
                        output: bytes.clone(),
                    });
                    true
                }
            }
        }
        TurnEventBody::PermissionRequested(request) => {
            if replayed && find_mut(entries, &request.req_id).is_some() {
                return false;
            }
            match find_mut(entries, &request.req_id) {
                Some(Entry::Permission {
                    request: existing, ..
                }) => {
                    existing.clone_from(request);
                    true
                }
                Some(_) => false,
                None => {
                    entries.push(Entry::Permission {
                        req_id: request.req_id.clone(),
                        request: request.clone(),
                        outcome: None,
                    });
                    true
                }
            }
        }
        TurnEventBody::PermissionResolved {
            req_id, outcome, ..
        } => {
            if replayed {
                return false;
            }
            match find_mut(entries, req_id) {
                Some(Entry::Permission {
                    outcome: existing, ..
                }) => {
                    *existing = Some(*outcome);
                    true
                }
                _ => false,
            }
        }
        TurnEventBody::ElicitationRequested(request) => {
            if replayed && find_mut(entries, &request.req_id).is_some() {
                return false;
            }
            match find_mut(entries, &request.req_id) {
                Some(Entry::Elicitation {
                    request: existing, ..
                }) => {
                    existing.clone_from(request);
                    true
                }
                Some(_) => false,
                None => {
                    entries.push(Entry::Elicitation {
                        req_id: request.req_id.clone(),
                        request: request.clone(),
                        outcome: None,
                        values: std::collections::BTreeMap::new(),
                    });
                    true
                }
            }
        }
        TurnEventBody::ElicitationResolved {
            req_id,
            outcome,
            values,
        } => {
            if replayed {
                return false;
            }
            match find_mut(entries, req_id) {
                Some(Entry::Elicitation {
                    outcome: existing,
                    values: existing_values,
                    ..
                }) => {
                    *existing = Some(*outcome);
                    existing_values.clone_from(values);
                    true
                }
                _ => false,
            }
        }
        TurnEventBody::Error { code, message, .. } => {
            if replayed && find_mut(entries, "error").is_some() {
                return false;
            }
            match find_mut(entries, "error") {
                Some(Entry::Error {
                    code: existing_code,
                    message: existing_message,
                }) => {
                    *existing_code = code.clone();
                    *existing_message = message.clone();
                    true
                }
                Some(_) => false,
                None => {
                    entries.push(Entry::Error {
                        code: code.clone(),
                        message: message.clone(),
                    });
                    true
                }
            }
        }
        TurnEventBody::StateChanged(_)
        | TurnEventBody::ConfigOptionsChanged { .. }
        | TurnEventBody::CommandsAvailable { .. }
        | TurnEventBody::SessionInfo(_)
        | TurnEventBody::Usage { .. }
        | TurnEventBody::FileWrite { .. }
        | TurnEventBody::Checkpoint { .. }
        | TurnEventBody::Unknown { .. }
        | TurnEventBody::ProviderExtension(_)
        | TurnEventBody::Compaction { .. } => false,
    }
}

fn find_mut<'a>(entries: &'a mut [Entry], id: &str) -> Option<&'a mut Entry> {
    entries.iter_mut().find(|entry| entry.entry_id() == id)
}

fn merge_tool_call(existing: &mut ToolCallPatch, incoming: &ToolCallPatch) {
    if incoming.title.is_some() {
        existing.title.clone_from(&incoming.title);
    }
    if incoming.kind.is_some() {
        existing.kind.clone_from(&incoming.kind);
    }
    if incoming.status.is_some() {
        existing.status = incoming.status;
    }
    if incoming.input.is_some() {
        existing.input.clone_from(&incoming.input);
    }
    if incoming.output.is_some() {
        existing.output.clone_from(&incoming.output);
    }
    if !incoming.locations.is_empty() {
        existing.locations.clone_from(&incoming.locations);
    }
    if incoming.origin.is_some() {
        existing.origin.clone_from(&incoming.origin);
    }
    if incoming.parent_tool_call_id.is_some() {
        existing
            .parent_tool_call_id
            .clone_from(&incoming.parent_tool_call_id);
    }
}
