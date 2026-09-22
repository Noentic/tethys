//! ACP v1/v2 negotiation and normalization into the `tethys-schema` event model.
//!
//! Process spawning belongs to `tethys-agent-servers`; this crate speaks ACP
//! over a supplied transport (architecture §7).

pub mod client;
pub mod elicitation;
pub mod map;
#[cfg(feature = "acp-v2")]
pub mod map_v2;
#[cfg(feature = "mock")]
pub mod mock;
pub(crate) mod terminal_host;

pub use client::{connect, AcpConnectOptions, AcpConnection, AcpProviderIntegration};
pub use map::SyntheticMessageIds;
