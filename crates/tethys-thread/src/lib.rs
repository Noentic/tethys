//! Thread state machine and entry model (architecture §6.1, UI-02).

pub mod connection;
pub mod state;

mod entries;

pub use connection::{
    AgentConnection, ConnectionError, ConnectionEvent, EventStream, NewSession, PermissionDecision,
    PermissionResolver, ResumeSession, SessionDeleter, SessionHandle, SessionId, SessionSummary,
};
pub use state::{EventOrigin, ThreadMachine, TurnRecord};
