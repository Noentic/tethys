//! Orchestrator stub (domain logic lives here, behind `tethys-api`).
//!
//! Module: `tethys-core` — deep module in progress. S0.0 exposes only
//! `host.info` / `host.health`; Phase 1 grows the thread state machine,
//! event log, and ConnectionStore behind the same `TethysApi` seam.

use tethys_api::{ApiError, TethysApi};
use tethys_schema::{HealthStatus, HostInfo};

#[derive(Debug, Default)]
pub struct Core {
    version: String,
}

impl Core {
    pub fn new(version: impl Into<String>) -> Self {
        Self {
            version: version.into(),
        }
    }
}

impl TethysApi for Core {
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
