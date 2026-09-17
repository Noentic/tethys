use rusqlite::{params, Connection, Result};
use std::path::Path;
use std::time::Instant;

pub struct EventStore {
    conn: Connection,
}

#[derive(Debug, Clone)]
pub struct StoredEvent {
    pub id: i64,
    pub thread_id: String,
    pub seq: u32,
    pub event_type: String,
    pub payload: String,
}

impl EventStore {
    /// Opens or creates SQLite database with WAL mode and PRAGMA tunings.
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let conn = Connection::open(path)?;

        // Performance & concurrency tunings (architecture §12)
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA busy_timeout = 5000;
             PRAGMA cache_size = -64000; -- 64 MB cache
             
             CREATE TABLE IF NOT EXISTS events (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 thread_id TEXT NOT NULL,
                 seq INTEGER NOT NULL,
                 event_type TEXT NOT NULL,
                 payload TEXT NOT NULL,
                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                 UNIQUE(thread_id, seq)
             );
             CREATE INDEX IF NOT EXISTS idx_events_thread_seq ON events(thread_id, seq);",
        )?;

        Ok(Self { conn })
    }

    pub fn in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS events (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 thread_id TEXT NOT NULL,
                 seq INTEGER NOT NULL,
                 event_type TEXT NOT NULL,
                 payload TEXT NOT NULL,
                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                 UNIQUE(thread_id, seq)
             );
             CREATE INDEX IF NOT EXISTS idx_events_thread_seq ON events(thread_id, seq);",
        )?;
        Ok(Self { conn })
    }

    /// Appends a batch of events inside a single transaction.
    pub fn append_batch(
        &mut self,
        thread_id: &str,
        events: &[(u32, &str, &str)],
    ) -> Result<f64> {
        let t0 = Instant::now();
        let tx = self.conn.transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO events (thread_id, seq, event_type, payload) VALUES (?1, ?2, ?3, ?4)",
            )?;
            for (seq, event_type, payload) in events {
                stmt.execute(params![thread_id, seq, event_type, payload])?;
            }
        }
        tx.commit()?;
        Ok(t0.elapsed().as_secs_f64() * 1000.0)
    }

    /// Reads events for thread replay starting from since_seq.
    pub fn read_events(
        &self,
        thread_id: &str,
        since_seq: u32,
        limit: usize,
    ) -> Result<Vec<StoredEvent>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT id, thread_id, seq, event_type, payload FROM events 
             WHERE thread_id = ?1 AND seq >= ?2 ORDER BY seq ASC LIMIT ?3",
        )?;

        let rows = stmt.query_map(params![thread_id, since_seq, limit as i64], |row| {
            Ok(StoredEvent {
                id: row.get(0)?,
                thread_id: row.get(1)?,
                seq: row.get(2)?,
                event_type: row.get(3)?,
                payload: row.get(4)?,
            })
        })?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    pub fn count_events(&self, thread_id: &str) -> Result<usize> {
        self.conn.query_row(
            "SELECT count(*) FROM events WHERE thread_id = ?1",
            params![thread_id],
            |row| row.get::<_, i64>(0).map(|c| c as usize),
        )
    }
}
