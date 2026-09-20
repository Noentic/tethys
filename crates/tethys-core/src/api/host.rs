//! `host.*` implementations.

use tethys_api::{ApiError, HostApi};
use tethys_schema::{HealthStatus, HostInfo};

use crate::Core;

impl HostApi for Core {
    async fn host_info(&self) -> Result<HostInfo, ApiError> {
        Ok(HostInfo {
            version: self.version.clone(),
            platform: std::env::consts::OS.to_string(),
        })
    }

    async fn health(&self) -> Result<HealthStatus, ApiError> {
        Ok(HealthStatus {
            ok: true,
            core_version: self.version.clone(),
        })
    }
}
