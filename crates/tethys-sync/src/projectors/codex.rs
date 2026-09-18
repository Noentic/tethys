//! Codex projector: project `~/.codex/config.toml` (comment-preserving).

use std::collections::BTreeMap;
use std::path::Path;

use tethys_schema::sync::{
    EntryMeta, RegistryEntry, RegistryValue, Scope, TargetId, TransportKind,
};
use toml_edit::{value, Array, DocumentMut, Item, Table};

use super::{secret_env_key, Projector, TargetFile};
use crate::error::SyncError;
use crate::format::toml;

pub struct CodexProjector;

impl Projector for CodexProjector {
    fn target(&self) -> TargetId {
        TargetId::Codex
    }

    fn detect(&self, _root: &Path, home: &Path) -> Vec<TargetFile> {
        vec![TargetFile {
            path: home.join(".codex").join("config.toml"),
            scope: Scope::Global,
        }]
    }

    fn inject(
        &self,
        original: &str,
        name: &str,
        entry: &RegistryEntry,
    ) -> Result<String, SyncError> {
        if entry.transport == TransportKind::Sse {
            return Err(SyncError::Unsupported("codex:sse".into()));
        }
        let mut doc = if original.trim().is_empty() {
            DocumentMut::new()
        } else {
            toml::parse(original)?
        };
        let servers = toml::table_or_insert(&mut doc, "mcp_servers")?;
        servers.insert(name, Item::Table(entry_table(entry)?));
        Ok(doc.to_string())
    }

    fn rollback(&self, modified: &str, name: &str) -> Result<String, SyncError> {
        let mut doc = toml::parse(modified)?;
        if let Some(servers) = doc.get_mut("mcp_servers").and_then(Item::as_table_mut) {
            servers.remove(name);
            if servers.is_empty() {
                doc.remove("mcp_servers");
            }
        }
        Ok(doc.to_string())
    }

    fn read_entries(&self, original: &str) -> Result<BTreeMap<String, RegistryEntry>, SyncError> {
        if original.trim().is_empty() {
            return Ok(BTreeMap::new());
        }
        let doc = toml::parse(original)?;
        let Some(servers) = doc.get("mcp_servers").and_then(Item::as_table) else {
            return Ok(BTreeMap::new());
        };
        let mut entries = BTreeMap::new();
        for (name, item) in servers.iter() {
            let Some(table) = item.as_table() else {
                continue;
            };
            entries.insert(name.to_string(), entry_from_table(table));
        }
        Ok(entries)
    }
}

fn entry_table(entry: &RegistryEntry) -> Result<Table, SyncError> {
    let mut table = Table::new();
    match entry.transport {
        TransportKind::Stdio => {
            let command = entry
                .command
                .clone()
                .ok_or_else(|| SyncError::Registry("stdio entry requires a command".into()))?;
            table.insert("command", value(command));
            if !entry.args.is_empty() {
                let mut args = Array::new();
                for arg in &entry.args {
                    args.push(arg.as_str());
                }
                table.insert("args", Item::Value(toml_edit::Value::Array(args)));
            }
            let plain: Vec<(&String, &str)> = entry
                .env
                .iter()
                .filter_map(|(key, value)| value.as_plain().map(|text| (key, text)))
                .collect();
            if !plain.is_empty() {
                let mut env = Table::new();
                for (key, text) in plain {
                    env.insert(key, value(text));
                }
                table.insert("env", Item::Table(env));
            }
        }
        TransportKind::Http => {
            let url = entry
                .url
                .clone()
                .ok_or_else(|| SyncError::Registry("http entry requires a url".into()))?;
            table.insert("url", value(url));
            if let Some(key) = secret_env_key(entry) {
                table.insert("bearer_token_env_var", value(key));
            }
        }
        TransportKind::Sse => return Err(SyncError::Unsupported("codex:sse".into())),
    }
    Ok(table)
}

fn entry_from_table(table: &Table) -> RegistryEntry {
    let command = table
        .get("command")
        .and_then(Item::as_str)
        .map(str::to_string);
    let url = table.get("url").and_then(Item::as_str).map(str::to_string);
    let transport = if url.is_some() {
        TransportKind::Http
    } else {
        TransportKind::Stdio
    };
    let args = table
        .get("args")
        .and_then(Item::as_array)
        .map(|array| {
            array
                .iter()
                .filter_map(|item| item.as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let mut env = BTreeMap::new();
    if let Some(env_table) = table.get("env").and_then(Item::as_table) {
        for (key, item) in env_table.iter() {
            if let Some(text) = item.as_str() {
                env.insert(key.to_string(), RegistryValue::plain(text));
            }
        }
    }
    if let Some(key) = table.get("bearer_token_env_var").and_then(Item::as_str) {
        env.insert(
            key.to_string(),
            RegistryValue::secret(format!("keychain:tethys/{key}")),
        );
    }
    RegistryEntry {
        transport,
        command,
        args,
        env,
        url,
        headers: BTreeMap::new(),
        meta: EntryMeta::default(),
    }
}
