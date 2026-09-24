use super::*;

impl ThreadSessions {
    /// Attaches the existing durable event log used by a persistent Core.
    pub fn set_event_store(&self, store: Arc<EventStore>) {
        *self.event_store.write() = Some(store);
    }

    /// Restores committed threads and removes unprompted drafts left by a crash.
    pub async fn hydrate_threads(&self) -> Result<(), ApiError> {
        let event_store = self.event_store.read().clone();
        let Some(store) = event_store else {
            return Ok(());
        };
        let records = store
            .list_threads()
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;
        for record in records {
            if record.prepared {
                store
                    .delete_thread(&record.summary.id)
                    .await
                    .map_err(|error| ApiError::Internal(error.to_string()))?;
                continue;
            }
            if let Some(number) = record
                .summary
                .id
                .as_str()
                .strip_prefix("thread-")
                .and_then(|suffix| suffix.parse::<u64>().ok())
            {
                self.next_thread_id
                    .fetch_max(number.saturating_add(1), Ordering::Relaxed);
            }
            let workspace_id = WorkspaceId::new(&record.summary.workspace_id);
            let roots = self.roots.read().clone();
            let workspace_root = roots.root(&workspace_id).await?;
            let event_count = store
                .count_events(&record.summary.id)
                .await
                .map_err(|error| ApiError::Internal(error.to_string()))?;
            let stored_events = store
                .read_events(
                    &record.summary.id,
                    0,
                    u32::try_from(event_count).unwrap_or(u32::MAX),
                )
                .await
                .map_err(|error| ApiError::Internal(error.to_string()))?;
            let mut machine = ThreadMachine::new(record.summary.id.clone());
            machine.set_title(record.summary.title.clone());
            if let Some(session_id) = &record.summary.session_id {
                machine.set_session(SessionId(session_id.clone()));
            }
            let mut events = Vec::new();
            for stored in stored_events {
                if stored.event_type != THREAD_EVENT {
                    continue;
                }
                let Ok(mut body) = serde_json::from_str::<TurnEventBody>(&stored.payload) else {
                    continue;
                };
                if let TurnEventBody::ProviderExtension(extension) = &mut body {
                    // ACP responders are process-local; after restart these rows
                    // remain inspectable but cannot be answered.
                    extension.request_id = None;
                }
                let seq = u32::try_from(stored.seq).unwrap_or(u32::MAX);
                machine.apply(seq, &body, EventOrigin::Live);
                events.push(EventEnvelope {
                    thread_id: record.summary.id.clone(),
                    seq,
                    event: body,
                });
            }
            match record.summary.state {
                tethys_schema::thread::ThreadState::Archived => machine.archive(),
                tethys_schema::thread::ThreadState::Interrupted => machine.mark_interrupted(),
                _ if matches!(
                    machine.state(),
                    tethys_schema::thread::ThreadState::Running
                        | tethys_schema::thread::ThreadState::AwaitingApproval
                ) =>
                {
                    machine.mark_interrupted()
                }
                _ => {}
            }
            let next_seq = u32::try_from(record.latest_seq.saturating_add(1)).unwrap_or(u32::MAX);
            let id = record.summary.id.clone();
            let handle = ThreadHandle::new(ThreadInner {
                machine,
                workspace_id: record.summary.workspace_id,
                agent_profile_id: record.summary.agent_profile_id,
                workdir: PathBuf::from(record.workdir),
                workspace_root,
                additional_directories: record
                    .additional_directories
                    .iter()
                    .map(PathBuf::from)
                    .collect(),
                session: record.summary.session_id.map(SessionId),
                config_options: record.config_options,
                capabilities: record.capabilities,
                prepared: false,
                lease: None,
                events,
                next_seq,
                cancel: CancelState {
                    thread_id: id.clone(),
                    phase: CancelPhase::Idle,
                },
                prompt_in_flight: false,
                pending_extensions: HashSet::new(),
            });
            self.threads.lock().insert(id, handle);
        }
        Ok(())
    }

    pub(super) async fn persist_thread(&self, handle: &Arc<ThreadHandle>) -> Result<(), ApiError> {
        let event_store = self.event_store.read().clone();
        persist_thread_state(event_store, handle).await
    }

    /// Imports Provider sessions whose working directories remain inside the
    /// selected trusted workspace. The ACP adapter consumes all list cursors.
    pub async fn import_sessions(
        &self,
        profile_id: &str,
        workspace_id: &str,
    ) -> Result<Vec<ThreadSummary>, ApiError> {
        let key = self.profile_key(profile_id)?;
        let roots = self.roots.read().clone();
        let workspace_root = roots.root(&WorkspaceId::new(workspace_id)).await?;
        let lease = self
            .store
            .acquire(&key)
            .await
            .map_err(|error| map_store_error(&self.health, profile_id, error))?;
        let connection = lease.connection().clone();
        let listed = connection
            .list_sessions(&workspace_root)
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;
        let canonical_root = workspace_root.clone();
        let (workspace_root, listed) = tokio::task::spawn_blocking(move || {
            let workspace_root = std::fs::canonicalize(canonical_root)
                .map_err(|error| ApiError::Internal(error.to_string()))?;
            let sessions = listed
                .into_iter()
                .filter_map(|session| {
                    if !session.cwd.is_absolute() {
                        return None;
                    }
                    let cwd = std::fs::canonicalize(&session.cwd).ok()?;
                    cwd.starts_with(&workspace_root).then_some((session, cwd))
                })
                .collect::<Vec<_>>();
            Ok::<_, ApiError>((workspace_root, sessions))
        })
        .await
        .map_err(|error| ApiError::Internal(format!("session import check failed: {error}")))??;
        let capabilities = connection.capabilities().clone();
        drop(lease);

        let mut imported = Vec::new();
        for (session, cwd) in listed {
            let existing = self.threads.lock().values().find_map(|handle| {
                let inner = handle.inner.lock();
                (inner.agent_profile_id == profile_id
                    && inner.workspace_id == workspace_id
                    && inner.session.as_ref() == Some(&session.id))
                .then(|| inner.summary())
            });
            if let Some(existing) = existing {
                imported.push(existing);
                continue;
            }

            let id = ThreadId::new(format!(
                "thread-{}",
                self.next_thread_id.fetch_add(1, Ordering::Relaxed)
            ));
            let mut machine = ThreadMachine::new(id.clone());
            machine.set_session(session.id.clone());
            if let Some(title) = &session.title {
                machine.set_title(title.clone());
            }
            let handle = ThreadHandle::new(ThreadInner {
                machine,
                workspace_id: workspace_id.to_string(),
                agent_profile_id: profile_id.to_string(),
                workdir: cwd,
                workspace_root: workspace_root.clone(),
                additional_directories: Vec::new(),
                session: Some(session.id),
                config_options: Vec::new(),
                capabilities: Some(capabilities.clone()),
                prepared: false,
                lease: None,
                events: Vec::new(),
                next_seq: 1,
                cancel: CancelState {
                    thread_id: id.clone(),
                    phase: CancelPhase::Idle,
                },
                prompt_in_flight: false,
                pending_extensions: HashSet::new(),
            });
            let summary = handle.inner.lock().summary();
            self.persist_thread(&handle).await?;
            self.threads.lock().insert(id, handle);
            imported.push(summary);
        }
        Ok(imported)
    }

    pub fn thread_workspace_root(&self, id: &ThreadId) -> Result<PathBuf, ApiError> {
        let handle = self.handle(id)?;
        let root = handle.inner.lock().workspace_root.clone();
        Ok(root)
    }

    pub fn mcp_servers_for_thread(
        &self,
        id: &ThreadId,
    ) -> Result<Vec<serde_json::Value>, ApiError> {
        let handle = self.handle(id)?;
        let (key, workspace_root) = {
            let inner = handle.inner.lock();
            let key = self.profile_key(&inner.agent_profile_id)?;
            (key, inner.workspace_root.clone())
        };
        self.mcp_servers(&workspace_root, &key)
    }

    pub fn list(&self) -> Vec<ThreadSummary> {
        self.threads
            .lock()
            .values()
            .filter_map(|handle| {
                let inner = handle.inner.lock();
                (!inner.prepared).then(|| inner.summary())
            })
            .collect()
    }

    pub async fn get(&self, id: &ThreadId) -> Result<ThreadSessionView, ApiError> {
        let handle = self.handle(id)?;
        let (state, profile_id) = {
            let inner = handle.inner.lock();
            (inner.machine.state(), inner.agent_profile_id.clone())
        };
        // A persisted transcript remains readable before profiles are restored
        // (for example during a cold open or when a provider was removed).
        // Reconnect when the profile is available, but do not make hydration
        // depend on a live child process.
        if state != tethys_schema::thread::ThreadState::Archived
            && self.profile_key(&profile_id).is_ok()
        {
            self.ensure_connection(&handle).await?;
        }
        let (thread, entries, events, config_options, capabilities, session, latest_seq) = {
            let inner = handle.inner.lock();
            (
                inner.summary(),
                inner.machine.entries().to_vec(),
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
        Ok(ThreadSessionView {
            thread,
            entries,
            events,
            config_options,
            capabilities,
            permission_mode,
            latest_seq,
        })
    }

    /// The thread's working directory, read without reconnecting its Provider.
    pub fn workdir(&self, id: &ThreadId) -> Result<String, ApiError> {
        Ok(self.handle(id)?.inner.lock().summary().workdir)
    }

    /// User prompts recorded so far: the turn index the webview's reducer
    /// derives from the same `MessageUpsert { role: User }` events.
    pub fn user_turns(&self, id: &ThreadId) -> Result<u32, ApiError> {
        let handle = self.handle(id)?;
        let inner = handle.inner.lock();
        let count = inner
            .machine
            .entries()
            .iter()
            .filter(|entry| {
                matches!(
                    entry,
                    Entry::Message {
                        role: Role::User,
                        ..
                    }
                )
            })
            .count();
        Ok(u32::try_from(count).unwrap_or(u32::MAX))
    }

    /// Events from `since_seq` (inclusive) followed by live events.
    pub fn subscribe(
        &self,
        id: &ThreadId,
        since_seq: u32,
    ) -> Result<tethys_api::EventStream, ApiError> {
        let handle = self.handle(id)?;
        let (receiver, backlog) = {
            let inner = handle.inner.lock();
            let receiver = handle.subscribers.subscribe();
            let backlog: Vec<EventEnvelope> = inner
                .events
                .iter()
                .filter(|event| event.seq > since_seq)
                .cloned()
                .collect();
            (receiver, backlog)
        };
        let live = stream::unfold(receiver, |mut receiver| async move {
            loop {
                match receiver.recv().await {
                    Ok(event) => return Some((event, receiver)),
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => return None,
                }
            }
        });
        let stream: Pin<Box<dyn futures::Stream<Item = EventEnvelope> + Send>> =
            Box::pin(stream::iter(backlog).chain(live));
        Ok(stream)
    }
}

/// Appends an event to the thread's in-memory log and returns its envelope.
pub(super) async fn append_event(
    handle: &Arc<ThreadHandle>,
    event_store: Option<Arc<EventStore>>,
    body: TurnEventBody,
    origin: EventOrigin,
) -> Result<EventEnvelope, ApiError> {
    let _writer = handle.event_writer.lock().await;
    let (thread_id, local_seq) = {
        let inner = handle.inner.lock();
        (inner.machine.id().clone(), inner.next_seq)
    };
    let seq = if let Some(store) = event_store {
        let payload =
            serde_json::to_string(&body).map_err(|error| ApiError::Internal(error.to_string()))?;
        let range = store
            .append_batch(
                &thread_id,
                &[NewEvent {
                    kind: THREAD_EVENT.into(),
                    payload,
                    entry: None,
                }],
            )
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;
        u32::try_from(range.last)
            .map_err(|error| ApiError::Internal(format!("thread sequence overflow: {error}")))?
    } else {
        local_seq
    };
    let envelope = {
        let mut inner = handle.inner.lock();
        inner.next_seq = seq.saturating_add(1);
        match &body {
            TurnEventBody::ProviderExtension(extension) => {
                if let Some(request_id) = &extension.request_id {
                    inner.pending_extensions.insert(request_id.clone());
                }
            }
            TurnEventBody::ProviderExtensionResolved { request_id, .. } => {
                inner.pending_extensions.remove(request_id);
            }
            _ => {}
        }
        inner.machine.apply(seq, &body, origin);
        let envelope = EventEnvelope {
            thread_id,
            seq,
            event: body,
        };
        inner.events.push(envelope.clone());
        envelope
    };
    let _ = handle.subscribers.send(envelope.clone());
    Ok(envelope)
}

pub(super) async fn persist_thread_state(
    event_store: Option<Arc<EventStore>>,
    handle: &Arc<ThreadHandle>,
) -> Result<(), ApiError> {
    let Some(store) = event_store else {
        return Ok(());
    };
    let (record, workspace_root) = {
        let inner = handle.inner.lock();
        (
            ThreadRecord {
                summary: inner.summary(),
                workdir: inner.workdir.display().to_string(),
                additional_directories: inner
                    .additional_directories
                    .iter()
                    .map(|path| path.display().to_string())
                    .collect(),
                config_options: inner.config_options.clone(),
                capabilities: inner.capabilities.clone(),
                prepared: inner.prepared,
                latest_seq: inner.next_seq.saturating_sub(1) as u64,
            },
            inner.workspace_root.display().to_string(),
        )
    };
    store
        .ensure_workspace(&record.summary.workspace_id, &workspace_root, "main")
        .await
        .map_err(|error| ApiError::Internal(error.to_string()))?;
    store
        .save_thread(record)
        .await
        .map_err(|error| ApiError::Internal(error.to_string()))
}
