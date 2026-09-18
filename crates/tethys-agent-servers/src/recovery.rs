use std::path::Path;
use std::sync::Arc;

use tethys_schema::connection::ConnectionKey;
use tethys_thread::{AgentConnection, ResumeSession, SessionId};

use crate::connection_store::{ConnectionStore, RecoveryOutcome, StoreError};

impl ConnectionStore {
    pub async fn recover(
        self: &Arc<Self>,
        key: &ConnectionKey,
        session: &SessionId,
        cwd: &Path,
        replay: bool,
    ) -> Result<RecoveryOutcome, StoreError> {
        let Some(connection) = self.live_connection(key)? else {
            return Ok(self.acquire_or_interrupt(key).await);
        };

        let cancelled = matches!(
            tokio::time::timeout(self.cancel_grace(), connection.cancel(session)).await,
            Ok(Ok(()))
        );
        if cancelled {
            return Ok(RecoveryOutcome::Cancelled);
        }

        let _ = tokio::time::timeout(self.cancel_grace(), connection.close_session(session)).await;

        let request = ResumeSession {
            session_id: session.clone(),
            cwd: cwd.to_path_buf(),
            additional_directories: Vec::new(),
            mcp_servers: Vec::new(),
            replay,
        };
        let resumed = matches!(
            tokio::time::timeout(self.cancel_grace(), connection.resume_session(request)).await,
            Ok(Ok(_))
        );
        if resumed {
            return Ok(RecoveryOutcome::SessionResumed);
        }

        drop(connection);
        if self.restart(key).await.is_ok() {
            return Ok(self.acquire_or_interrupt(key).await);
        }
        Ok(RecoveryOutcome::Interrupted)
    }

    async fn acquire_or_interrupt(self: &Arc<Self>, key: &ConnectionKey) -> RecoveryOutcome {
        match self.acquire(key).await {
            Ok(lease) => {
                drop(lease);
                RecoveryOutcome::ProcessRestarted
            }
            Err(_) => RecoveryOutcome::Interrupted,
        }
    }
}
