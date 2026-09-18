//! Durable, crash-safe event log and blob store.
//!
//! Exposes `EventStore` and `BlobStore` as the persistence seam for Tethys.

pub mod blobs;
pub mod error;

#[doc(hidden)]
pub mod entries;
#[doc(hidden)]
pub mod migrations;
#[doc(hidden)]
pub mod pool;
#[doc(hidden)]
pub mod schema;

use std::path::Path;
use std::sync::Arc;

use pool::ConnectionPool;

pub use blobs::BlobStore;
pub use error::StoreError;
pub use tethys_schema::store::{
    BlobHash, Entry, EntryKind, EntryPage, EntryUpsert, NewEvent, SeqRange, StoredEvent, ThreadId,
    ThreadView,
};

/// The primary persistence facade for threads, event logs, and blobs.
#[derive(Clone)]
pub struct EventStore {
    pool: Arc<ConnectionPool>,
    blobs: BlobStore,
}

impl EventStore {
    /// Opens or creates an EventStore at the given database path.
    ///
    /// Blobs are stored in a sibling `blobs/` directory beside the database file.
    pub async fn open(db_path: impl AsRef<Path>) -> Result<Self, StoreError> {
        let db_path = db_path.as_ref();
        let pool = ConnectionPool::open(db_path).await?;
        let blob_root = db_path.parent().unwrap_or_else(|| Path::new("."));
        let blobs = BlobStore::new(blob_root)?;
        Ok(Self {
            pool: Arc::new(pool),
            blobs,
        })
    }

    /// Opens an in-memory EventStore for fast functional tests.
    pub async fn in_memory() -> Result<Self, StoreError> {
        let pool = ConnectionPool::in_memory().await?;
        let temp_dir = tempfile::tempdir()?;
        let blobs = BlobStore::new(temp_dir.path())?;
        Ok(Self {
            pool: Arc::new(pool),
            blobs,
        })
    }

    /// Access the associated blob store.
    pub fn blobs(&self) -> &BlobStore {
        &self.blobs
    }

    /// Ensures a project record exists.
    pub async fn ensure_project(
        &self,
        project_id: &str,
        root_path: &str,
        isolation: &str,
    ) -> Result<(), StoreError> {
        let project_id = project_id.to_string();
        let root_path = root_path.to_string();
        let isolation = isolation.to_string();
        self.pool
            .writer()
            .call(move |conn| {
                schema::ensure_project(conn, &project_id, &root_path, &isolation)?;
                Ok::<_, StoreError>(())
            })
            .await?;
        Ok(())
    }

    /// Ensures a thread record exists within a project.
    pub async fn ensure_thread(
        &self,
        thread_id: &ThreadId,
        project_id: &str,
    ) -> Result<(), StoreError> {
        let thread_id = thread_id.clone();
        let project_id = project_id.to_string();
        self.pool
            .writer()
            .call(move |conn| {
                schema::ensure_thread(conn, &thread_id, &project_id)?;
                Ok::<_, StoreError>(())
            })
            .await?;
        Ok(())
    }

    /// Appends a batch of events atomically, allocating `seq` and updating materialized `entries`.
    pub async fn append_batch(
        &self,
        thread_id: &ThreadId,
        events: &[NewEvent],
    ) -> Result<SeqRange, StoreError> {
        let thread_id = thread_id.clone();
        let events = events.to_vec();
        let range = self
            .pool
            .writer()
            .call(move |conn| schema::append_batch(conn, &thread_id, &events))
            .await?;
        Ok(range)
    }

    /// Opens a thread transcript using materialized entries (zero-replay).
    pub async fn open_thread(
        &self,
        thread_id: &ThreadId,
        page: EntryPage,
    ) -> Result<ThreadView, StoreError> {
        let thread_id = thread_id.clone();
        let view = self
            .pool
            .reader()
            .call(move |conn| entries::open_thread(conn, &thread_id, page))
            .await?;
        Ok(view)
    }

    /// Reads events after `since_seq` (exclusive, 1-based; since_seq=0 returns everything).
    pub async fn events_since(
        &self,
        thread_id: &ThreadId,
        since_seq: u64,
        limit: u32,
    ) -> Result<Vec<StoredEvent>, StoreError> {
        let thread_id = thread_id.clone();
        let events = self
            .pool
            .reader()
            .call(move |conn| schema::read_events_since(conn, &thread_id, since_seq, limit))
            .await?;
        Ok(events)
    }

    /// Reads events starting from `since_seq` (inclusive, for replay/import/export).
    pub async fn read_events(
        &self,
        thread_id: &ThreadId,
        since_seq: u64,
        limit: u32,
    ) -> Result<Vec<StoredEvent>, StoreError> {
        let thread_id = thread_id.clone();
        let events = self
            .pool
            .reader()
            .call(move |conn| schema::read_events_inclusive(conn, &thread_id, since_seq, limit))
            .await?;
        Ok(events)
    }

    /// Returns the total number of events in the thread log.
    pub async fn count_events(&self, thread_id: &ThreadId) -> Result<u64, StoreError> {
        let thread_id = thread_id.clone();
        let count = self
            .pool
            .reader()
            .call(move |conn| schema::count_events(conn, &thread_id))
            .await?;
        Ok(count)
    }

    /// Executes a WAL checkpoint (TRUNCATE) on the database.
    pub async fn checkpoint(&self) -> Result<(), StoreError> {
        self.pool
            .writer()
            .call(|conn| {
                conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
                Ok::<_, StoreError>(())
            })
            .await?;
        Ok(())
    }
}
