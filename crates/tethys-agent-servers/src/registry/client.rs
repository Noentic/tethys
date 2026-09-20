//! The registry HTTP seam. Production uses `reqwest`; tests inject a
//! wiremock-backed source so the default suite stays deterministic.

use async_trait::async_trait;

use super::model::Registry;
use super::RegistryError;

/// Where a registry document comes from.
#[async_trait]
pub trait RegistrySource: Send + Sync {
    async fn fetch(&self) -> Result<Registry, RegistryError>;
}

/// The published registry endpoint.
pub const REGISTRY_URL: &str =
    "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

/// A `reqwest`-rustls source against the real registry (or any URL).
pub struct HttpRegistrySource {
    url: String,
    client: reqwest::Client,
}

impl HttpRegistrySource {
    /// Builds a source for the published registry endpoint.
    pub fn published() -> Result<Self, RegistryError> {
        Self::new(REGISTRY_URL)
    }

    /// Builds a source for an arbitrary URL (tests, mirrors).
    pub fn new(url: impl Into<String>) -> Result<Self, RegistryError> {
        let client = reqwest::Client::builder()
            .build()
            .map_err(|error| RegistryError::Fetch(error.to_string()))?;
        Ok(Self {
            url: url.into(),
            client,
        })
    }
}

#[async_trait]
impl RegistrySource for HttpRegistrySource {
    async fn fetch(&self) -> Result<Registry, RegistryError> {
        let response = self
            .client
            .get(&self.url)
            .send()
            .await
            .map_err(|error| RegistryError::Fetch(error.to_string()))?;
        if !response.status().is_success() {
            return Err(RegistryError::Fetch(format!(
                "registry returned {}",
                response.status()
            )));
        }
        let body = response
            .text()
            .await
            .map_err(|error| RegistryError::Fetch(error.to_string()))?;
        Registry::parse(&body)
    }
}
