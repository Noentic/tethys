//! Claude Code projector: project `.mcp.json` (user scope is import-only).

use std::collections::BTreeMap;
use std::path::Path;

use jsonc_parser::cst::CstInputValue;
use serde_json::Value;
use tethys_schema::sync::{EntryMeta, RegistryEntry, Scope, TargetId, TransportKind};

use super::{claude_ref, import_value, infer_transport, Projector, TargetFile};
use crate::error::SyncError;
use crate::format::json_cst;

pub struct ClaudeCodeProjector;

impl Projector for ClaudeCodeProjector {
    fn target(&self) -> TargetId {
        TargetId::ClaudeCode
    }

    fn detect(&self, root: &Path, _home: &Path) -> Vec<TargetFile> {
        vec![TargetFile {
            path: root.join(".mcp.json"),
            scope: Scope::Project,
        }]
    }

    fn inject(
        &self,
        original: &str,
        name: &str,
        entry: &RegistryEntry,
    ) -> Result<String, SyncError> {
        if entry.transport == TransportKind::Sse {
            return Err(SyncError::Unsupported("claude-code:sse".into()));
        }
        let source = if original.trim().is_empty() {
            "{}"
        } else {
            original
        };
        let root = json_cst::parse(source, false)?;
        let object = json_cst::root_object(&root)?;
        let servers = json_cst::object_or_set(&object, "mcpServers");
        json_cst::set(&servers, name, entry_value(entry)?);
        Ok(root.to_string())
    }

    fn rollback(&self, modified: &str, name: &str) -> Result<String, SyncError> {
        let root = json_cst::parse(modified, false)?;
        let object = json_cst::root_object(&root)?;
        if let Some(servers) = json_cst::object(&object, "mcpServers") {
            json_cst::remove(&servers, name);
            if servers.properties().is_empty() {
                json_cst::remove(&object, "mcpServers");
            }
        }
        Ok(root.to_string())
    }

    fn read_entries(&self, original: &str) -> Result<BTreeMap<String, RegistryEntry>, SyncError> {
        if original.trim().is_empty() {
            return Ok(BTreeMap::new());
        }
        let root = json_cst::parse(original, false)?;
        let Some(object) = root.object_value() else {
            return Ok(BTreeMap::new());
        };
        let Some(servers) = object.object_value("mcpServers") else {
            return Ok(BTreeMap::new());
        };
        Ok(entries_from_object(&servers))
    }
}

pub(crate) fn entries_from_object(
    servers: &jsonc_parser::cst::CstObject,
) -> BTreeMap<String, RegistryEntry> {
    let mut entries = BTreeMap::new();
    for prop in servers.properties() {
        let Some(name) = prop.decoded_name() else {
            continue;
        };
        let Some(value) = prop.value().and_then(|node| node.to_serde_value()) else {
            continue;
        };
        if let Some(entry) = entry_from_value(&value) {
            entries.insert(name, entry);
        }
    }
    entries
}

pub(crate) fn entry_from_value(value: &Value) -> Option<RegistryEntry> {
    let map = value.as_object()?;
    let command = map
        .get("command")
        .and_then(Value::as_str)
        .map(str::to_string);
    let url = map.get("url").and_then(Value::as_str).map(str::to_string);
    let transport = infer_transport(
        map.get("type").and_then(Value::as_str),
        url.is_some(),
        command.is_some(),
    );
    let args = string_list(map.get("args"));
    let env = string_map(map.get("env"));
    let headers = string_map(map.get("headers"));
    Some(RegistryEntry {
        transport,
        command,
        args,
        env,
        url,
        headers,
        meta: EntryMeta::default(),
    })
}

pub(crate) fn string_list(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn string_map(
    value: Option<&Value>,
) -> BTreeMap<String, tethys_schema::sync::RegistryValue> {
    value
        .and_then(Value::as_object)
        .map(|map| {
            map.iter()
                .filter_map(|(key, item)| {
                    item.as_str().map(|text| (key.clone(), import_value(text)))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn entry_value(entry: &RegistryEntry) -> Result<CstInputValue, SyncError> {
    let mut fields: Vec<(String, CstInputValue)> = vec![(
        "type".into(),
        CstInputValue::String(entry.transport.as_str().to_string()),
    )];
    match entry.transport {
        TransportKind::Stdio => {
            let command = entry
                .command
                .clone()
                .ok_or_else(|| SyncError::Registry("stdio entry requires a command".into()))?;
            fields.push(("command".into(), CstInputValue::String(command)));
            if !entry.args.is_empty() {
                fields.push((
                    "args".into(),
                    CstInputValue::Array(
                        entry
                            .args
                            .iter()
                            .map(|arg| CstInputValue::String(arg.clone()))
                            .collect(),
                    ),
                ));
            }
            if !entry.env.is_empty() {
                fields.push((
                    "env".into(),
                    CstInputValue::Object(
                        entry
                            .env
                            .iter()
                            .map(|(key, value)| {
                                (key.clone(), CstInputValue::String(claude_ref(key, value)))
                            })
                            .collect(),
                    ),
                ));
            }
        }
        TransportKind::Http => {
            let url = entry
                .url
                .clone()
                .ok_or_else(|| SyncError::Registry("http entry requires a url".into()))?;
            fields.push(("url".into(), CstInputValue::String(url)));
            if !entry.headers.is_empty() {
                fields.push((
                    "headers".into(),
                    CstInputValue::Object(
                        entry
                            .headers
                            .iter()
                            .map(|(key, value)| {
                                (key.clone(), CstInputValue::String(claude_ref(key, value)))
                            })
                            .collect(),
                    ),
                ));
            }
        }
        TransportKind::Sse => return Err(SyncError::Unsupported("claude-code:sse".into())),
    }
    Ok(CstInputValue::Object(fields))
}
