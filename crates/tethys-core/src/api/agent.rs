//! `agent.*` implementations.

use tethys_api::{AgentApi, ApiError};
use tethys_schema::connection::ConnectionEntry;

use crate::Core;

impl AgentApi for Core {
    async fn agent_connections_list(&self) -> Result<Vec<ConnectionEntry>, ApiError> {
        Ok(self.sessions.connections())
    }

    async fn agent_connections_restart(&self, profile_id: String) -> Result<(), ApiError> {
        self.sessions.restart_connection(&profile_id).await
    }
}
