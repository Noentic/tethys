//! Benchmark helpers (non-§12.1; S0.1).

use tethys_schema::DiffHunk;

use crate::ApiError;

/// Synthetic diff generation for the S0.1 benchmark.
pub trait BenchApi: Send + Sync {
    fn generate_synthetic_diff(
        &self,
        line_count: usize,
    ) -> impl std::future::Future<Output = Result<Vec<DiffHunk>, ApiError>> + Send;
}
