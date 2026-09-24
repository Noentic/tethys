use super::persistence::append_event;
use super::*;

impl ThreadSessions {
    /// Creates a real ACP fork and seeds its Tethys transcript from the same
    /// settled snapshot, so the fork has both provider context and visible history.
    pub async fn fork(&self, id: &ThreadId) -> Result<ThreadBootstrap, ApiError> {
        let source = self.handle(id)?;
        self.ensure_connection(&source).await?;
        let (summary, source_session, additional_directories, history) = {
            let mut inner = source.inner.lock();
            if inner.prompt_in_flight
                || inner.machine.state() != tethys_schema::thread::ThreadState::Idle
            {
                return Err(ApiError::Conflict(
                    "a session can only be forked when its turn is idle".into(),
                ));
            }
            let source_session = inner
                .session
                .clone()
                .ok_or_else(|| ApiError::Internal("thread has no Provider session".into()))?;
            inner.prompt_in_flight = true;
            (
                inner.summary(),
                source_session,
                inner.additional_directories.clone(),
                inner.events.clone(),
            )
        };
        let result = self
            .fork_settled_snapshot(summary, source_session, additional_directories, history)
            .await;
        source.inner.lock().prompt_in_flight = false;
        result
    }

    pub(super) async fn fork_settled_snapshot(
        &self,
        source_summary: ThreadSummary,
        source_session: SessionId,
        additional_directories: Vec<PathBuf>,
        history: Vec<EventEnvelope>,
    ) -> Result<ThreadBootstrap, ApiError> {
        let profile_id = source_summary.agent_profile_id.clone();
        let key = self.profile_key(&profile_id)?;
        let target = self
            .create_with_visibility(
                CreateThread {
                    workspace_id: source_summary.workspace_id.clone(),
                    agent_profile_id: profile_id.clone(),
                    workdir: source_summary.workdir.clone(),
                    additional_directories: Vec::new(),
                    isolation: None,
                },
                false,
                None,
            )
            .await?;
        let target_id = target.id.clone();
        let target_handle = self.handle(&target_id)?;
        target_handle.inner.lock().additional_directories = additional_directories.clone();

        let lease = match self.store.acquire(&key).await {
            Ok(lease) => lease,
            Err(error) => {
                let _ = self.delete(&target_id).await;
                return Err(map_store_error(&self.health, &profile_id, error));
            }
        };
        let connection = lease.connection().clone();
        if !connection.capabilities().session_fork {
            drop(lease);
            let _ = self.delete(&target_id).await;
            return Err(ApiError::InvalidConfig(
                "Provider does not support session forks".into(),
            ));
        }
        let workspace_root = target_handle.inner.lock().workspace_root.clone();
        let mcp_servers = match self.mcp_servers(&workspace_root, &key) {
            Ok(servers) => servers,
            Err(error) => {
                drop(lease);
                let _ = self.delete(&target_id).await;
                return Err(error);
            }
        };
        let session_handle = match connection
            .fork_session(
                &source_session,
                NewSession {
                    cwd: PathBuf::from(&source_summary.workdir),
                    additional_directories,
                    mcp_servers,
                },
            )
            .await
        {
            Ok(session) => session,
            Err(error) => {
                drop(lease);
                let _ = self.delete(&target_id).await;
                return Err(map_connection_error(&self.health, &profile_id, error));
            }
        };
        let forked_session = session_handle.id.clone();
        let capabilities = connection.capabilities().clone();
        {
            let mut inner = target_handle.inner.lock();
            inner.machine.set_session(forked_session.clone());
            inner.session = Some(forked_session.clone());
            inner.config_options = session_handle.config_options;
            inner.capabilities = Some(capabilities);
            inner.lease = Some(lease);
        }
        if let Err(error) = self.persist_thread(&target_handle).await {
            cleanup_failed_fork(&connection, &forked_session).await;
            let _ = self.delete(&target_id).await;
            return Err(error);
        }

        let event_store = self.event_store.read().clone();
        for envelope in history {
            if matches!(
                &envelope.event,
                TurnEventBody::ProviderExtension(_)
                    | TurnEventBody::ProviderExtensionResolved { .. }
                    | TurnEventBody::CancelPhaseChanged(_)
            ) {
                continue;
            }
            if let Err(error) = append_event(
                &target_handle,
                event_store.clone(),
                envelope.event,
                EventOrigin::Live,
            )
            .await
            {
                cleanup_failed_fork(&connection, &forked_session).await;
                let _ = self.delete(&target_id).await;
                return Err(error);
            }
        }
        {
            let mut inner = target_handle.inner.lock();
            inner
                .machine
                .set_title(format!("{} (fork)", source_summary.title));
            inner.prepared = false;
        }
        if let Err(error) = self.persist_thread(&target_handle).await {
            cleanup_failed_fork(&connection, &forked_session).await;
            let _ = self.delete(&target_id).await;
            return Err(error);
        }
        self.register_permission_context(&target_handle, &forked_session, None);
        self.start_reader(&target_handle, connection, forked_session);
        let (thread, events, config_options, capabilities, session, latest_seq) = {
            let inner = target_handle.inner.lock();
            (
                inner.summary(),
                inner.events.clone(),
                inner.config_options.clone(),
                inner.capabilities.clone(),
                inner.session.clone(),
                inner.next_seq.saturating_sub(1),
            )
        };
        let permission_mode = session
            .as_ref()
            .and_then(|session| self.permissions().context(session))
            .map(|context| context.mode)
            .unwrap_or(tethys_schema::workspace::PermissionMode::Supervised);
        Ok(ThreadBootstrap {
            thread,
            events,
            config_options,
            capabilities,
            permission_mode,
            latest_seq,
        })
    }
}

async fn cleanup_failed_fork(connection: &AcpConnection, session: &SessionId) {
    if let Some(deleter) = connection.session_deleter() {
        if deleter.delete_session(session).await.is_ok() {
            return;
        }
    }
    if connection.capabilities().close_session && connection.close_session(session).await.is_ok() {
        return;
    }
    let _ = connection.cancel(session).await;
}
