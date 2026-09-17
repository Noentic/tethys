use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use toml_edit::{value, DocumentMut, Item, Table};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct McpServerConfig {
    pub server_type: String,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    pub env: BTreeMap<String, String>,
}

pub trait Projector {
    fn name(&self) -> &str;
    fn inject(
        &self,
        original: &str,
        server_name: &str,
        config: &McpServerConfig,
    ) -> Result<String, String>;
    fn rollback(&self, modified: &str, server_name: &str) -> Result<String, String>;
}

/// Claude Code Projector (.mcp.json or ~/.claude.json).
/// Manages "mcpServers" key in JSON while preserving formatting.
pub struct ClaudeCodeProjector;

impl Projector for ClaudeCodeProjector {
    fn name(&self) -> &str {
        "claude-code"
    }

    fn inject(
        &self,
        original: &str,
        server_name: &str,
        config: &McpServerConfig,
    ) -> Result<String, String> {
        let mut doc: Value = if original.trim().is_empty() {
            serde_json::json!({})
        } else {
            serde_json::from_str(original).map_err(|e| format!("invalid json: {e}"))?
        };

        if !doc.is_object() {
            return Err("root must be a JSON object".into());
        }

        let obj = doc.as_object_mut().unwrap();
        let servers = obj
            .entry("mcpServers")
            .or_insert_with(|| Value::Object(serde_json::Map::new()));

        if let Some(s_obj) = servers.as_object_mut() {
            let mut server_val = serde_json::Map::new();
            server_val.insert("type".into(), Value::String(config.server_type.clone()));
            if let Some(cmd) = &config.command {
                server_val.insert("command".into(), Value::String(cmd.clone()));
            }
            if !config.args.is_empty() {
                server_val.insert(
                    "args".into(),
                    Value::Array(config.args.iter().map(|a| Value::String(a.clone())).collect()),
                );
            }
            if let Some(url) = &config.url {
                server_val.insert("url".into(), Value::String(url.clone()));
            }
            if !config.env.is_empty() {
                let mut env_map = serde_json::Map::new();
                for (k, v) in &config.env {
                    env_map.insert(k.clone(), Value::String(v.clone()));
                }
                server_val.insert("env".into(), Value::Object(env_map));
            }
            s_obj.insert(server_name.to_string(), Value::Object(server_val));
        }

        serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())
    }

    fn rollback(&self, modified: &str, server_name: &str) -> Result<String, String> {
        let mut doc: Value =
            serde_json::from_str(modified).map_err(|e| format!("invalid json: {e}"))?;
        if let Some(obj) = doc.as_object_mut() {
            if let Some(servers) = obj.get_mut("mcpServers").and_then(|s| s.as_object_mut()) {
                servers.remove(server_name);
                if servers.is_empty() {
                    obj.remove("mcpServers");
                }
            }
        }
        serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())
    }
}

/// Codex CLI Projector (~/.codex/config.toml).
/// Preserves comments, whitespace, and formatting via `toml_edit`.
pub struct CodexProjector;

impl Projector for CodexProjector {
    fn name(&self) -> &str {
        "codex"
    }

    fn inject(
        &self,
        original: &str,
        server_name: &str,
        config: &McpServerConfig,
    ) -> Result<String, String> {
        let mut doc: DocumentMut = if original.trim().is_empty() {
            DocumentMut::new()
        } else {
            original
                .parse::<DocumentMut>()
                .map_err(|e| format!("invalid toml: {e}"))?
        };

        if !doc.contains_key("mcp_servers") {
            doc.insert("mcp_servers", Item::Table(Table::new()));
        }

        let mcp_table = doc["mcp_servers"].as_table_mut().ok_or("mcp_servers must be a table")?;
        
        let mut server_table = Table::new();
        server_table.insert("type", value(&config.server_type));
        if let Some(cmd) = &config.command {
            server_table.insert("command", value(cmd));
        }
        if !config.args.is_empty() {
            let mut arr = toml_edit::Array::new();
            for arg in &config.args {
                arr.push(arg.as_str());
            }
            server_table.insert("args", Item::Value(toml_edit::Value::Array(arr)));
        }

        mcp_table.insert(server_name, Item::Table(server_table));

        Ok(doc.to_string())
    }

    fn rollback(&self, modified: &str, server_name: &str) -> Result<String, String> {
        let mut doc: DocumentMut = modified
            .parse::<DocumentMut>()
            .map_err(|e| format!("invalid toml: {e}"))?;

        if let Some(mcp_table) = doc.get_mut("mcp_servers").and_then(|t| t.as_table_mut()) {
            mcp_table.remove(server_name);
            if mcp_table.is_empty() {
                doc.remove("mcp_servers");
            }
        }

        Ok(doc.to_string())
    }
}

/// OpenCode Projector (opencode.json).
pub struct OpenCodeProjector;

impl Projector for OpenCodeProjector {
    fn name(&self) -> &str {
        "opencode"
    }

    fn inject(
        &self,
        original: &str,
        server_name: &str,
        config: &McpServerConfig,
    ) -> Result<String, String> {
        let mut doc: Value = if original.trim().is_empty() {
            serde_json::json!({})
        } else {
            serde_json::from_str(original).map_err(|e| format!("invalid json: {e}"))?
        };

        let obj = doc.as_object_mut().ok_or("root must be an object")?;
        let mcp = obj
            .entry("mcp")
            .or_insert_with(|| Value::Object(serde_json::Map::new()));

        if let Some(mcp_obj) = mcp.as_object_mut() {
            let mut s = serde_json::Map::new();
            s.insert("type".into(), Value::String(config.server_type.clone()));
            if let Some(cmd) = &config.command {
                s.insert("command".into(), Value::String(cmd.clone()));
            }
            mcp_obj.insert(server_name.to_string(), Value::Object(s));
        }

        serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())
    }

    fn rollback(&self, modified: &str, server_name: &str) -> Result<String, String> {
        let mut doc: Value =
            serde_json::from_str(modified).map_err(|e| format!("invalid json: {e}"))?;
        if let Some(obj) = doc.as_object_mut() {
            if let Some(mcp) = obj.get_mut("mcp").and_then(|m| m.as_object_mut()) {
                mcp.remove(server_name);
                if mcp.is_empty() {
                    obj.remove("mcp");
                }
            }
        }
        serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())
    }
}
