//! Prompt-queue wire types (`thread.queue.*`; M1.10, `architecture.md §12.1`).
//!
//! A queued prompt is a pending turn a caller staged while a thread was
//! running. It persists as an event on the thread's own log; these types are
//! the typed view the webview reads and writes.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::thread::{ContentBlock, ThreadId};

/// One staged prompt in a thread's queue.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct QueuedPrompt {
    /// Stable queue-item identity (`q-<seq>`), used by remove/reorder.
    pub id: String,
    pub thread_id: ThreadId,
    /// The turn as it will be prompted; text plus any non-text blocks.
    pub blocks: Vec<ContentBlock>,
    /// Zero-based position in the queue.
    pub ordinal: u32,
}
