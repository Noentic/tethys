//! OpenCode projector: project `opencode.json(c)` (project and user scope).
//!
//! Writes the v2 `mcp.servers.<name>` shape; the legacy flat `mcp.<name>`
//! shape is read for import and drift detection only.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use jsonc_parser::cst::{CstInputValue, CstObject};
use serde_json::Value;
use tethys_schema::sync::{EntryMeta, RegistryEntry, Scope, TargetId, TransportKind};

use super::claude_code::{string_list, string_map};
use super::{infer_transport, opencode_ref, Projector, TargetFile};
use crate::error::SyncError;
use crate::format::json_cst;

pub struct OpenCodeProjector;

impl Projector for OpenCodeProjector {
    fn target(&self) -> TargetId {
        TargetId::OpenCode
    }

    fn detect(&self, root: &Path, home: &Path) -> Vec<TargetFile> {
        let global_dir = home.join(".config").join("opencode");
        vec![
            TargetFile {
                path: pick_config(root, "opencode.json"),
                scope: Scope::Project,
            },
            TargetFile {
                path: pick_config(&global_dir, "opencode.json"),
                scope: Scope::Global,
            },
        ]
    }

    fn inject(
        &self,
        original: &str,
        name: &str,
        entry: &RegistryEntry,
    ) -> Result<String, SyncError> {
        if entry.transport == TransportKind::Sse {
            return Err(SyncError::Unsupported("opencode:sse".into()));
        }
        let source = if original.trim().is_empty() {
            "{}"
        } else {
            original
        };
        let root = json_cst::parse(source, true)?;
        let object = json_cst::root_object(&root)?;
        let mcp = json_cst::object_or_set(&object, "mcp");
        let servers = json_cst::object_or_set(&mcp, "servers");
        json_cst::set(&servers, name, entry_value(entry)?);
        Ok(root.to_string())
    }

    fn rollback(&self, modified: &str, name: &str) -> Result<String, SyncError> {
        let root = json_cst::parse(modified, true)?;
        let object = json_cst::root_object(&root)?;
        if let Some(mcp) = json_cst::object(&object, "mcp") {
            if let Some(servers) = json_cst::object(&mcp, "servers") {
                json_cst::remove(&servers, name);
                if servers.properties().is_empty() {
                    json_cst::remove(&mcp, "servers");
                }
            }
            if mcp.properties().is_empty() {
                json_cst::remove(&object, "mcp");
            }
        }
        Ok(root.to_string())
    }

    fn read_entries(&self, original: &str) -> Result<BTreeMap<String, RegistryEntry>, SyncError> {
        if original.trim().is_empty() {
            return Ok(BTreeMap::new());
        }
        let root = json_cst::parse(original, true)?;
        let Some(object) = root.object_value() else {
            return Ok(BTreeMap::new());
        };
        let Some(mcp) = object.object_value("mcp") else {
            return Ok(BTreeMap::new());
        };
        let mut entries = BTreeMap::new();
        if let Some(servers) = mcp.object_value("servers") {
            entries.extend(entries_from_object(&servers));
        }
        for prop in mcp.properties() {
            if prop.decoded_name().as_deref() == Some("servers") {
                continue;
            }
            let Some(name) = prop.decoded_name() else {
                continue;
            };
            let Some(value) = prop.value().and_then(|node| node.to_serde_value()) else {
                continue;
            };
            if let Some(mut entry) = entry_from_value(&value) {
                entry.meta.legacy = true;
                entries.insert(name, entry);
            }
        }
        Ok(entries)
    }
}

fn pick_config(dir: &Path, default_name: &str) -> PathBuf {
    let json = dir.join(default_name);
    if json.exists() {
        return json;
    }
    let jsonc = dir.join(format!("{default_name}c"));
    if jsonc.exists() {
        return jsonc;
    }
    json
}

fn entries_from_object(servers: &CstObject) -> BTreeMap<String, RegistryEntry> {
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

fn entry_from_value(value: &Value) -> Option<RegistryEntry> {
    let map = value.as_object()?;
    let command_value = map.get("command");
    let (command, args) = match command_value {
        Some(Value::String(text)) => (Some(text.clone()), string_list(map.get("args"))),
        Some(Value::Array(_)) => {
            let mut argv = string_list(command_value);
            if argv.is_empty() {
                (None, string_list(map.get("args")))
            } else {
                let command = argv.remove(0);
                (Some(command), argv)
            }
        }
        _ => (None, string_list(map.get("args"))),
    };
    let url = map.get("url").and_then(Value::as_str).map(str::to_string);
    let transport = infer_transport(
        map.get("type").and_then(Value::as_str),
        url.is_some(),
        command.is_some(),
    );
    let env = string_map(map.get("environment").or_else(|| map.get("env")));
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

fn entry_value(entry: &RegistryEntry) -> Result<CstInputValue, SyncError> {
    match entry.transport {
        TransportKind::Stdio => {
            let command = entry
                .command
                .clone()
                .ok_or_else(|| SyncError::Registry("stdio entry requires a command".into()))?;
            let mut argv = vec![CstInputValue::String(command)];
            argv.extend(
                entry
                    .args
                    .iter()
                    .map(|arg| CstInputValue::String(arg.clone())),
            );
            let mut fields = vec![
                ("type".into(), CstInputValue::String("local".to_string())),
                ("command".into(), CstInputValue::Array(argv)),
            ];
            if !entry.env.is_empty() {
                fields.push((
                    "environment".into(),
                    CstInputValue::Object(
                        entry
                            .env
                            .iter()
                            .map(|(key, value)| {
                                (key.clone(), CstInputValue::String(opencode_ref(key, value)))
                            })
                            .collect(),
                    ),
                ));
            }
            Ok(CstInputValue::Object(fields))
        }
        TransportKind::Http => {
            let url = entry
                .url
                .clone()
                .ok_or_else(|| SyncError::Registry("http entry requires a url".into()))?;
            let mut fields = vec![
                ("type".into(), CstInputValue::String("remote".to_string())),
                ("url".into(), CstInputValue::String(url)),
            ];
            if !entry.headers.is_empty() {
                fields.push((
                    "headers".into(),
                    CstInputValue::Object(
                        entry
                            .headers
                            .iter()
                            .map(|(key, value)| {
                                (key.clone(), CstInputValue::String(opencode_ref(key, value)))
                            })
                            .collect(),
                    ),
                ));
            }
            Ok(CstInputValue::Object(fields))
        }
        TransportKind::Sse => Err(SyncError::Unsupported("opencode:sse".into())),
    }
}
