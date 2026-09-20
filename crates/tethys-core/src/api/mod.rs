//! Per-namespace `TethysApi` sub-trait implementations for [`Core`](crate::Core).
//!
//! Each module holds one `impl <Namespace>Api for Core` block, so a chunk
//! adding a namespace method edits only its own file. `TethysApi` itself is
//! satisfied through the blanket impl in `tethys-api`.

pub mod agent;
pub mod bench;
pub mod commands;
pub mod events;
pub mod git;
pub mod host;
pub mod permission;
pub mod search;
pub mod terminal;
pub mod thread;
pub mod workspace;
