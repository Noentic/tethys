//! The published ACP-Registry wire schema (overview D16).
//!
//! `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`
//! returns `{ version, agents[], extensions[] }`. Unknown fields are ignored
//! because the registry is an external contract that will grow; an entry
//! missing its `distribution` is a typed error, not a silent default.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::RegistryError;

/// Top-level registry document.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Registry {
    pub version: String,
    #[serde(default)]
    pub agents: Vec<RegistryAgent>,
    #[serde(default)]
    pub extensions: Vec<serde_json::Value>,
}

impl Registry {
    /// Parses a registry document, tolerating unknown fields.
    pub fn parse(json: &str) -> Result<Self, RegistryError> {
        serde_json::from_str(json).map_err(|error| RegistryError::Malformed(error.to_string()))
    }

    /// Finds one agent by id.
    pub fn agent(&self, id: &str) -> Option<&RegistryAgent> {
        self.agents.iter().find(|agent| agent.id == id)
    }
}

/// One listed agent.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryAgent {
    pub id: String,
    pub name: String,
    /// Plain `X.Y.Z`, matching the distribution's pinned artifact.
    pub version: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub repository: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub license_url: Option<String>,
    pub distribution: Distribution,
    #[serde(default)]
    pub website: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
}

/// How an agent is distributed: `npx`, `uvx`, or a per-platform `binary`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Distribution {
    Npx(NpxDistribution),
    Uvx(UvxDistribution),
    Binary(HashMap<String, BinaryTarget>),
}

impl Distribution {
    /// The distribution kind as the UI shows it: `npx`, `uvx`, `binary`.
    pub fn kind(&self) -> &'static str {
        match self {
            Distribution::Npx(_) => "npx",
            Distribution::Uvx(_) => "uvx",
            Distribution::Binary(_) => "binary",
        }
    }
}

/// An `npx` distribution: a pinned npm package plus extra args.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NpxDistribution {
    pub package: String,
    #[serde(default)]
    pub args: Vec<String>,
}

/// A `uvx` distribution: a pinned Python package plus extra args.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UvxDistribution {
    pub package: String,
    #[serde(default)]
    pub args: Vec<String>,
}

/// One platform's binary download.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BinaryTarget {
    pub archive: String,
    /// Optional; absence installs with a visible warning (D16).
    #[serde(default)]
    pub sha256: Option<String>,
    pub cmd: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../../tests/fixtures/registry.json");

    #[test]
    fn captured_fixture_deserializes_the_real_shape() {
        let registry = Registry::parse(FIXTURE).expect("fixture");
        assert_eq!(registry.version, "1.0.0");
        assert_eq!(registry.agents.len(), 3);

        let claude = registry.agent("claude-acp").expect("claude-acp");
        assert_eq!(claude.distribution.kind(), "npx");
        match &claude.distribution {
            Distribution::Npx(npx) => {
                assert!(npx.package.starts_with("@agentclientprotocol/claude-agent-acp@"));
            }
            other => panic!("expected npx, got {other:?}"),
        }

        let opencode = registry.agent("opencode").expect("opencode");
        assert_eq!(opencode.distribution.kind(), "binary");
        match &opencode.distribution {
            Distribution::Binary(targets) => {
                let linux = targets.get("linux-x86_64").expect("linux target");
                assert_eq!(linux.cmd, "./opencode");
                assert_eq!(linux.args, vec!["acp".to_string()]);
                assert!(linux.sha256.is_some());
            }
            other => panic!("expected binary, got {other:?}"),
        }

        let antigravity = registry.agent("antigravity-acp").expect("antigravity-acp");
        match &antigravity.distribution {
            Distribution::Binary(targets) => {
                let linux = targets.get("linux-x86_64").expect("linux target");
                assert_eq!(linux.args, vec!["--uid=".to_string()]);
                assert!(linux.sha256.is_none());
            }
            other => panic!("expected binary, got {other:?}"),
        }
    }

    #[test]
    fn unknown_extra_fields_are_ignored() {
        let json = r#"{
            "version": "1.0.0",
            "future_top_level": true,
            "agents": [{
                "id": "x",
                "name": "X",
                "version": "1.0.0",
                "distribution": { "npx": { "package": "x@1.0.0", "future": 1 } },
                "extra": "ignored"
            }]
        }"#;
        let registry = Registry::parse(json).expect("tolerant");
        assert_eq!(registry.agent("x").expect("agent").name, "X");
    }

    #[test]
    fn missing_distribution_is_a_typed_error() {
        let json = r#"{"version":"1.0.0","agents":[{"id":"x","name":"X","version":"1.0.0"}]}"#;
        let error = Registry::parse(json).expect_err("malformed");
        assert!(matches!(error, RegistryError::Malformed(_)));
    }
}
