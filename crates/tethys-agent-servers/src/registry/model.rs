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
        let registry: Self = serde_json::from_str(json)
            .map_err(|error| RegistryError::Malformed(error.to_string()))?;
        if let Some(agent) = registry.agents.iter().find(|agent| {
            agent.distribution.is_empty()
                || agent.preview.as_ref().is_some_and(|preview| {
                    preview.distribution.is_empty() || preview.distribution.binary.is_some()
                })
        }) {
            return Err(RegistryError::Malformed(format!(
                "agent {} has an invalid distribution option",
                agent.id
            )));
        }
        Ok(registry)
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
    pub authors: Vec<String>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub license_url: Option<String>,
    pub distribution: Distribution,
    #[serde(default)]
    pub website: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub preview: Option<PreviewChannel>,
}

/// Distribution options published together for an agent. The registry permits
/// more than one option; an install selects the best runnable option locally.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Distribution {
    #[serde(default)]
    pub npx: Option<NpxDistribution>,
    #[serde(default)]
    pub uvx: Option<UvxDistribution>,
    #[serde(default)]
    pub binary: Option<HashMap<String, BinaryTarget>>,
}

impl Distribution {
    /// Distribution kinds in stable UI order.
    pub fn kinds(&self) -> Vec<&'static str> {
        let mut kinds = Vec::with_capacity(3);
        if self.npx.is_some() {
            kinds.push("npx");
        }
        if self.uvx.is_some() {
            kinds.push("uvx");
        }
        if self.binary.is_some() {
            kinds.push("binary");
        }
        kinds
    }

    pub fn is_empty(&self) -> bool {
        self.npx.is_none() && self.uvx.is_none() && self.binary.is_none()
    }
}

/// An entry's optional, unverified preview distribution.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PreviewChannel {
    pub version: String,
    pub distribution: Distribution,
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
        assert_eq!(claude.distribution.kinds(), ["npx"]);
        let npx = claude.distribution.npx.as_ref().expect("npx");
        assert!(npx
            .package
            .starts_with("@agentclientprotocol/claude-agent-acp@"));

        let opencode = registry.agent("opencode").expect("opencode");
        assert_eq!(opencode.distribution.kinds(), ["binary"]);
        let targets = opencode.distribution.binary.as_ref().expect("binary");
        let linux = targets.get("linux-x86_64").expect("linux target");
        assert_eq!(linux.cmd, "./opencode");
        assert_eq!(linux.args, vec!["acp".to_string()]);
        assert!(linux.sha256.is_some());

        let antigravity = registry.agent("antigravity-acp").expect("antigravity-acp");
        let targets = antigravity.distribution.binary.as_ref().expect("binary");
        let linux = targets.get("linux-x86_64").expect("linux target");
        assert_eq!(linux.args, vec!["--uid=".to_string()]);
        assert!(linux.sha256.is_none());
    }

    #[test]
    fn all_offered_distribution_options_and_author_metadata_are_preserved() {
        let registry = Registry::parse(r#"{
            "version":"1",
            "agents":[{
                "id":"multi","name":"Multi","version":"1.0.0",
                "authors":["Author"],
                "distribution":{
                    "npx":{"package":"multi@1.0.0"},
                    "uvx":{"package":"multi==1.0.0"},
                    "binary":{"linux-x86_64":{"archive":"https://example.test/multi","cmd":"./multi"}}
                }
            }]
        }"#).expect("valid registry");
        let agent = registry.agent("multi").expect("agent");
        assert_eq!(agent.distribution.kinds(), ["npx", "uvx", "binary"]);
        assert_eq!(agent.authors[0], "Author");
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

    #[test]
    fn empty_distribution_is_rejected() {
        let error = Registry::parse(
            r#"{"version":"1","agents":[{"id":"x","name":"X","version":"1","distribution":{}}]}"#,
        )
        .expect_err("no install option");
        assert!(matches!(error, RegistryError::Malformed(_)));
    }
}
