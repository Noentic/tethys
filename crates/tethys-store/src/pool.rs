//! Connection pool holding 1 writer and 2 readers.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio_rusqlite::{Connection, OpenFlags};

use crate::error::StoreError;
use crate::migrations::{migrate_to_latest, verify_schema_version};
use crate::schema::configure_pragmas;

static MEM_DB_COUNTER: AtomicUsize = AtomicUsize::new(1);

/// Internal connection pool for `EventStore`.
pub struct ConnectionPool {
    writer: Connection,
    readers: [Connection; 2],
    next_reader: AtomicUsize,
}

impl ConnectionPool {
    /// Opens the connection pool for a file path.
    pub async fn open(path: impl AsRef<Path>) -> Result<Self, StoreError> {
        let path = path.as_ref().to_path_buf();

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        Self::init_pool(path).await
    }

    /// Opens an in-memory connection pool using SQLite shared cache URI.
    pub async fn in_memory() -> Result<Self, StoreError> {
        let db_id = MEM_DB_COUNTER.fetch_add(1, Ordering::Relaxed);
        let uri = format!("file:tethys_mem_{db_id}?mode=memory&cache=shared");

        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_URI;

        let writer = Connection::open_with_flags(&uri, flags).await?;
        writer
            .call(|conn| {
                configure_pragmas(conn, 8000, 1000)?;
                migrate_to_latest(conn)?;
                Ok::<_, StoreError>(())
            })
            .await?;

        let reader1 = Connection::open_with_flags(&uri, flags).await?;
        reader1
            .call(|conn| {
                configure_pragmas(conn, 4000, 1000)?;
                conn.execute_batch("PRAGMA foreign_keys = ON;")?;
                verify_schema_version(conn)?;
                Ok::<_, StoreError>(())
            })
            .await?;

        let reader2 = Connection::open_with_flags(&uri, flags).await?;
        reader2
            .call(|conn| {
                configure_pragmas(conn, 4000, 1000)?;
                conn.execute_batch("PRAGMA foreign_keys = ON;")?;
                verify_schema_version(conn)?;
                Ok::<_, StoreError>(())
            })
            .await?;

        Ok(Self {
            writer,
            readers: [reader1, reader2],
            next_reader: AtomicUsize::new(0),
        })
    }

    async fn init_pool(path: PathBuf) -> Result<Self, StoreError> {
        let writer = Connection::open(&path).await?;
        writer
            .call(|conn| {
                configure_pragmas(conn, 8000, 1000)?;
                migrate_to_latest(conn)?;
                Ok::<_, StoreError>(())
            })
            .await?;

        let reader1 = Connection::open(&path).await?;
        reader1
            .call(|conn| {
                configure_pragmas(conn, 4000, 1000)?;
                conn.execute_batch("PRAGMA foreign_keys = ON;")?;
                verify_schema_version(conn)?;
                Ok::<_, StoreError>(())
            })
            .await?;

        let reader2 = Connection::open(&path).await?;
        reader2
            .call(|conn| {
                configure_pragmas(conn, 4000, 1000)?;
                conn.execute_batch("PRAGMA foreign_keys = ON;")?;
                verify_schema_version(conn)?;
                Ok::<_, StoreError>(())
            })
            .await?;

        Ok(Self {
            writer,
            readers: [reader1, reader2],
            next_reader: AtomicUsize::new(0),
        })
    }

    /// Access the writer connection for transactional mutations.
    pub fn writer(&self) -> &Connection {
        &self.writer
    }

    /// Access a reader connection using round-robin distribution.
    pub fn reader(&self) -> &Connection {
        let idx = self.next_reader.fetch_add(1, Ordering::Relaxed) % self.readers.len();
        &self.readers[idx]
    }
}
