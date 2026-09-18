//! Projection ownership records and content digests.

use std::collections::BTreeMap;

use tethys_schema::sync::{Applied, RegistryEntry, Scope, TargetId};
use tethys_store::ProjectionRow;

use crate::error::SyncError;

/// Canonical digest of one registry entry.
pub fn entry_digest(entry: &RegistryEntry) -> String {
    let bytes = serde_json::to_vec(entry).unwrap_or_default();
    blake3::hash(&bytes).to_hex().to_string()
}

/// Digest of a file's bytes.
pub fn file_digest(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}

/// Builds the store row for one applied projection.
pub fn applied_to_row(applied: &Applied, updated_at: i64) -> Result<ProjectionRow, SyncError> {
    Ok(ProjectionRow {
        target: applied.target.as_str().to_string(),
        path: applied.path.clone(),
        scope: applied.scope.as_str().to_string(),
        file_hash: applied.file_hash.clone(),
        created: applied.created,
        updated_at,
        entries: serde_json::to_string(&applied.entries)?,
    })
}

/// Rebuilds an [`Applied`] record from its store row.
pub fn applied_from_row(row: &ProjectionRow) -> Result<Applied, SyncError> {
    let target = TargetId::parse(&row.target)
        .ok_or_else(|| SyncError::Registry(format!("unknown target {}", row.target)))?;
    let scope = Scope::parse(&row.scope)
        .ok_or_else(|| SyncError::Registry(format!("unknown scope {}", row.scope)))?;
    let entries: BTreeMap<String, String> = serde_json::from_str(&row.entries)?;
    Ok(Applied {
        target,
        path: row.path.clone(),
        scope,
        file_hash: row.file_hash.clone(),
        created: row.created,
        entries,
    })
}
