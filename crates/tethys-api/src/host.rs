//! `host.*` namespace (`architecture.md` §12.1).

use tethys_schema::{HealthStatus, HostInfo};

use crate::ApiError;

/// Host identity and pairing methods.
pub trait HostApi: Send + Sync {
    fn host_info(&self) -> impl std::future::Future<Output = Result<HostInfo, ApiError>> + Send;

    fn host_pair(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("host.pair")) }
    }

    fn health(&self) -> impl std::future::Future<Output = Result<HealthStatus, ApiError>> + Send;
}
