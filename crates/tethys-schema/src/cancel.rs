//! Cancel-state contract (`thread.cancel_state`, M1.6c U1).
//!
//! Cancellation is orthogonal to [`crate::thread::ThreadState`]: a thread in
//! `Running` can be in `CancelRequested`. The `Stop` control reads this small
//! type and renders its four phases; the backend (M1.12) fills it and supplies
//! the grace deadline. The webview never runs its own timer as the authority.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::thread::ThreadId;

/// Which phase of the cancellation ladder a thread is in.
///
/// Tagged `phase` in kebab-case, so TypeScript gets a discriminated union the
/// `Stop` control can switch on exhaustively. The wire spelling
/// (`cancel-requested`) differs from the webview-local store's snake_case
/// union; `@tethys/state` reconciles the two in one mapper.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "phase", rename_all = "kebab-case")]
pub enum CancelPhase {
    /// No cancellation in flight.
    Idle,
    /// The protocol-level cancel was sent; the grace window is open. The
    /// deadline is an absolute RFC 3339 instant the backend supplies, not a
    /// remaining duration that would go stale across an IPC hop.
    CancelRequested { grace_deadline: String },
    /// The grace window closed without acknowledgement; the destructive
    /// fallback ladder is armed.
    GraceElapsed,
    /// The escalation is running (`SIGKILL`).
    Terminating,
}

/// Phase envelope, so the phase can later ride an event without inventing a
/// second shape.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CancelState {
    pub thread_id: ThreadId,
    pub phase: CancelPhase,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn round_trip(json: &str) {
        let parsed: CancelState = serde_json::from_str(json).expect(json);
        assert_eq!(
            serde_json::to_value(&parsed).expect("serialize"),
            serde_json::from_str::<serde_json::Value>(json).expect("value"),
        );
    }

    #[test]
    fn all_four_phases_round_trip() {
        round_trip(r#"{"thread_id":"t1","phase":{"phase":"idle"}}"#);
        round_trip(
            r#"{"thread_id":"t1","phase":{"phase":"cancel-requested","grace_deadline":"2026-09-20T12:00:05Z"}}"#,
        );
        round_trip(r#"{"thread_id":"t1","phase":{"phase":"grace-elapsed"}}"#);
        round_trip(r#"{"thread_id":"t1","phase":{"phase":"terminating"}}"#);
    }

    #[test]
    fn cancel_requested_requires_a_deadline() {
        assert!(serde_json::from_str::<CancelState>(
            r#"{"thread_id":"t1","phase":{"phase":"cancel-requested"}}"#,
        )
        .is_err());
    }

    #[test]
    fn wire_spellings_are_kebab_case() {
        let phase = serde_json::to_value(CancelPhase::GraceElapsed).expect("serialize");
        assert_eq!(phase, serde_json::json!({ "phase": "grace-elapsed" }));
    }
}
