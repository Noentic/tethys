//! Thread state machine (UI-02) over the normalized event stream.

use crate::connection::SessionId;
use crate::entries::apply_event;
use tethys_schema::thread::{Entry, StopReason, ThreadId, ThreadState, TurnEventBody};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventOrigin {
    Live,
    Replay,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TurnRecord {
    pub index: u32,
    pub started_seq: u32,
    pub ended_seq: Option<u32>,
    pub stop_reason: Option<StopReason>,
}

/// Pure reducer: thread state, turns, and materialized entries.
#[derive(Debug)]
pub struct ThreadMachine {
    id: ThreadId,
    state: ThreadState,
    entries: Vec<Entry>,
    turns: Vec<TurnRecord>,
    latest_seq: u32,
    session_id: Option<SessionId>,
    title: Option<String>,
}

impl ThreadMachine {
    pub fn new(id: ThreadId) -> Self {
        Self {
            id,
            state: ThreadState::Idle,
            entries: Vec::new(),
            turns: Vec::new(),
            latest_seq: 0,
            session_id: None,
            title: None,
        }
    }

    pub fn id(&self) -> &ThreadId {
        &self.id
    }

    pub fn state(&self) -> ThreadState {
        self.state
    }

    pub fn entries(&self) -> &[Entry] {
        &self.entries
    }

    pub fn turns(&self) -> &[TurnRecord] {
        &self.turns
    }

    pub fn latest_seq(&self) -> u32 {
        self.latest_seq
    }

    pub fn session_id(&self) -> Option<&SessionId> {
        self.session_id.as_ref()
    }

    pub fn title(&self) -> Option<&str> {
        self.title.as_deref()
    }

    /// Binds the agent session created for or resumed by this thread.
    pub fn set_session(&mut self, session_id: SessionId) {
        self.session_id = Some(session_id);
    }

    /// Applies a normalized event. Replayed events only materialize entries
    /// that do not exist yet and never drive state transitions (D12): a resume
    /// transcript describes the past, not the live thread.
    pub fn apply(&mut self, seq: u32, event: &TurnEventBody, origin: EventOrigin) {
        self.latest_seq = self.latest_seq.max(seq);
        if origin == EventOrigin::Replay {
            apply_event(&mut self.entries, event, true);
            return;
        }

        match event {
            TurnEventBody::StateChanged(changed) => match &changed.state {
                tethys_schema::thread::SessionState::Running => {
                    if self.state != ThreadState::Running {
                        self.turns.push(TurnRecord {
                            index: self.turns.len() as u32,
                            started_seq: seq,
                            ended_seq: None,
                            stop_reason: None,
                        });
                    }
                    self.state = ThreadState::Running;
                }
                tethys_schema::thread::SessionState::Idle { stop_reason } => {
                    self.end_turn(seq, stop_reason.clone());
                    self.state = ThreadState::Idle;
                }
                tethys_schema::thread::SessionState::RequiresAction => {
                    self.state = ThreadState::AwaitingApproval;
                }
            },
            TurnEventBody::PermissionRequested(_) => {
                apply_event(&mut self.entries, event, false);
                self.state = ThreadState::AwaitingApproval;
            }
            TurnEventBody::PermissionResolved { .. } => {
                apply_event(&mut self.entries, event, false);
                if self.state == ThreadState::AwaitingApproval {
                    self.state = ThreadState::Running;
                }
            }
            TurnEventBody::ElicitationRequested(_) => {
                apply_event(&mut self.entries, event, false);
                self.state = ThreadState::AwaitingApproval;
            }
            TurnEventBody::ElicitationResolved { .. } => {
                apply_event(&mut self.entries, event, false);
                if self.state == ThreadState::AwaitingApproval {
                    self.state = ThreadState::Running;
                }
            }
            TurnEventBody::SessionInfo(info) => {
                if info.title.is_some() {
                    self.title.clone_from(&info.title);
                }
            }
            TurnEventBody::Error { .. } => {
                apply_event(&mut self.entries, event, false);
                self.state = ThreadState::Error;
            }
            other => {
                apply_event(&mut self.entries, other, false);
            }
        }
    }

    /// A successful resume reconnects a thread parked in `Interrupted`.
    pub fn mark_resumed(&mut self) {
        if self.state == ThreadState::Interrupted {
            self.state = ThreadState::Idle;
        }
    }

    /// Process death or transport loss mid-turn (architecture §6.2 ladder).
    pub fn mark_interrupted(&mut self) {
        self.end_turn(self.latest_seq, Some(StopReason::Error));
        self.state = ThreadState::Interrupted;
    }

    pub fn archive(&mut self) {
        self.state = ThreadState::Archived;
    }

    fn end_turn(&mut self, seq: u32, stop_reason: Option<StopReason>) {
        if let Some(turn) = self.turns.iter_mut().find(|turn| turn.ended_seq.is_none()) {
            turn.ended_seq = Some(seq);
            turn.stop_reason = stop_reason;
        }
    }
}
