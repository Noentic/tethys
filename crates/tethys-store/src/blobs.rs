//! Content-addressed blob store using BLAKE3.
//!
//! Blobs are stored at `<root>/blobs/<first2>/<hash>` with atomic rename and fsync.

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use tethys_schema::store::BlobHash;

use crate::error::StoreError;

/// Content-addressed blob store.
#[derive(Debug, Clone)]
pub struct BlobStore {
    root: PathBuf,
}

impl BlobStore {
    /// Initializes a blob store rooted at `root`.
    pub fn new(root: impl AsRef<Path>) -> Result<Self, StoreError> {
        let root = root.as_ref().to_path_buf();
        let blobs_dir = root.join("blobs");
        fs::create_dir_all(&blobs_dir)?;
        Ok(Self { root })
    }

    /// Stores a blob, returning its BLAKE3 hash.
    ///
    /// Writes to a temporary file in the shard directory, syncs data to disk,
    /// atomically renames to the target hash, and fsyncs the parent directory.
    pub fn put(&self, bytes: &[u8]) -> Result<BlobHash, StoreError> {
        let hash_str = blake3::hash(bytes).to_hex().to_string();
        let hash = BlobHash(hash_str);

        let shard_dir = self.shard_dir(&hash)?;
        let target_path = shard_dir.join(hash.as_str());

        // Deduplication: content addressing guarantees immutability
        if target_path.is_file() {
            return Ok(hash);
        }

        // Temporary file in the same directory guarantees rename is an atomic filesystem link/rename
        let mut temp_file = tempfile::NamedTempFile::new_in(&shard_dir)?;
        temp_file.write_all(bytes)?;
        temp_file.as_file().sync_all()?;
        temp_file.persist(&target_path).map_err(|e| e.error)?;

        // Fsync the parent directory so directory entry metadata is durable
        if let Ok(dir_file) = File::open(&shard_dir) {
            let _ = dir_file.sync_all();
        }

        Ok(hash)
    }

    /// Retrieves blob bytes, verifying BLAKE3 hash integrity.
    pub fn get(&self, hash: &BlobHash) -> Result<Option<Vec<u8>>, StoreError> {
        let Some(path) = self.path(hash) else {
            return Ok(None);
        };

        let bytes = fs::read(&path)?;
        let computed = blake3::hash(&bytes).to_hex().to_string();
        if computed != hash.as_str() {
            return Err(StoreError::BlobHashMismatch {
                expected: hash.0.clone(),
                found: computed,
            });
        }

        Ok(Some(bytes))
    }

    /// Returns the filesystem path to a blob if it exists (no read/hash verification).
    pub fn path(&self, hash: &BlobHash) -> Option<PathBuf> {
        if hash.len() < 2 {
            return None;
        }
        let shard = &hash.as_str()[..2];
        let p = self.root.join("blobs").join(shard).join(hash.as_str());
        if p.is_file() {
            Some(p)
        } else {
            None
        }
    }

    /// Opens a blob file directly for streaming (no whole-file read or hash verification).
    pub fn open(&self, hash: &BlobHash) -> Result<Option<File>, StoreError> {
        match self.path(hash) {
            Some(p) => Ok(Some(File::open(p)?)),
            None => Ok(None),
        }
    }

    /// Returns true if the blob exists.
    pub fn has(&self, hash: &BlobHash) -> bool {
        self.path(hash).is_some()
    }

    fn shard_dir(&self, hash: &BlobHash) -> Result<PathBuf, StoreError> {
        if hash.len() < 2 {
            return Err(StoreError::NotFound("invalid blob hash length".into()));
        }
        let shard = &hash.as_str()[..2];
        let dir = self.root.join("blobs").join(shard);
        fs::create_dir_all(&dir)?;
        Ok(dir)
    }
}
