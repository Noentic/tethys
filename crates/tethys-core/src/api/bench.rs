//! Benchmark helper implementations (non-§12.1).

use tethys_api::{ApiError, BenchApi};
use tethys_schema::DiffHunk;

use crate::{synthetic, Core};

impl BenchApi for Core {
    async fn generate_synthetic_diff(&self, line_count: usize) -> Result<Vec<DiffHunk>, ApiError> {
        Ok(synthetic::generate_synthetic_diff(line_count))
    }
}
