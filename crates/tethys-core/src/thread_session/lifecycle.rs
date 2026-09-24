use super::persistence::append_event;
use super::*;

impl ThreadSessions {
    pub fn new(
        store: Arc<ConnectionStore>,
        sync: SyncSource,
        roots: Arc<dyn WorkspaceRoots>,
    ) -> Self {
        let health = HealthRegistry::new(Arc::clone(&store));
        Self {
            store,
            sync,
            roots: RwLock::new(roots),
            profiles: Mutex::new(HashMap::new()),
            disabled: Mutex::new(HashSet::new()),
            threads: Mutex::new(HashMap::new()),
            next_thread_id: AtomicU64::new(1),
            event_store: RwLock::new(None),
            permissions: RwLock::new(PermissionRegistry::new()),
            health,
        }
    }

    pub fn with_default_roots(store: Arc<ConnectionStore>, sync: SyncSource) -> Self {
        Self::new(
            store,
            sync,
            Arc::new(crate::workspace_roots::StaticWorkspaces::new()),
        )
    }

    pub fn set_roots(&self, roots: Arc<dyn WorkspaceRoots>) {
        *self.roots.write() = roots;
    }

    /// Shares the policy registry the injected resolver reads (M1.7 U3).
    pub fn set_permissions(&self, registry: Arc<PermissionRegistry>) {
        *self.permissions.write() = registry;
    }

    pub fn permissions(&self) -> Arc<PermissionRegistry> {
        self.permissions.read().clone()
    }

    /// Answers a surfaced permission request (`permission.respond`).
    pub fn respond_permission(
        &self,
        thread_id: &ThreadId,
        req_id: &str,
        option_id: Option<String>,
    ) -> Result<(), ApiError> {
        self.permissions()
            .complete_permission(thread_id, req_id, option_id)
    }

    /// Answers a surfaced elicitation (`elicitation_respond`).
    pub fn respond_elicitation(
        &self,
        thread_id: &ThreadId,
        response: tethys_schema::elicitation::ElicitationResponse,
    ) -> Result<(), ApiError> {
        self.permissions().complete_elicitation(thread_id, response)
    }

    /// Sets a thread's permission mode (`thread.set_permission_mode`).
    pub fn set_permission_mode(
        &self,
        thread_id: &ThreadId,
        mode: tethys_schema::workspace::PermissionMode,
    ) -> Result<(), ApiError> {
        self.permissions().set_mode(thread_id, mode)
    }

    pub fn store(&self) -> &Arc<ConnectionStore> {
        &self.store
    }

    pub fn sync(&self) -> &SyncSource {
        &self.sync
    }

    pub async fn create(&self, request: CreateThread) -> Result<ThreadSummary, ApiError> {
        self.create_with_visibility(request, false, None).await
    }

    /// Reserves the id the next prepared thread takes, so a worktree can be
    /// registered under it before the session starts (`prepare_as`).
    pub fn reserve_thread_id(&self) -> ThreadId {
        ThreadId::new(format!(
            "thread-{}",
            self.next_thread_id.fetch_add(1, Ordering::Relaxed)
        ))
    }

    pub(super) async fn create_with_visibility(
        &self,
        request: CreateThread,
        prepared: bool,
        reserved: Option<ThreadId>,
    ) -> Result<ThreadSummary, ApiError> {
        if !self.profiles.lock().contains_key(&request.agent_profile_id) {
            return Err(ApiError::NotFound(format!(
                "agent profile {}",
                request.agent_profile_id
            )));
        }
        let workspace_id = WorkspaceId::new(&request.workspace_id);
        let roots = self.roots.read().clone();
        let workspace_root = roots.root(&workspace_id).await?;
        let mut additional_directories = Vec::new();
        for root_id in &request.additional_directories {
            if root_id == &request.workspace_id {
                return Err(ApiError::InvalidConfig(
                    "additional directory repeats the workspace root".into(),
                ));
            }
            let path = roots.root(&WorkspaceId::new(root_id)).await?;
            let canonical = tokio::fs::canonicalize(&path).await.map_err(|error| {
                ApiError::NotFound(format!("additional directory {}: {error}", path.display()))
            })?;
            if !additional_directories.contains(&canonical) {
                additional_directories.push(canonical);
            }
        }
        // The one `thread.create` call site consults `max_concurrent_sessions`
        // (architecture §10.6): a non-git folder admits one session, so a second
        // window or a direct API caller cannot bypass the cap. The check runs a
        // read-only git read, so it stays off the async worker.
        let root_for_check = workspace_root.clone();
        let limit = tokio::task::spawn_blocking(move || {
            crate::workspace::capability::max_concurrent_sessions_for_root(&root_for_check)
        })
        .await
        .map_err(|error| ApiError::Internal(format!("concurrency check failed: {error}")))?;
        if let Some(limit) = limit {
            let live = self
                .threads
                .lock()
                .values()
                .filter(|handle| {
                    let inner = handle.inner.lock();
                    inner.workspace_id == request.workspace_id
                        && !matches!(
                            inner.machine.state(),
                            tethys_schema::thread::ThreadState::Archived
                        )
                })
                .count() as u32;
            if live >= limit {
                return Err(ApiError::ConcurrencyLimit {
                    workspace_id: request.workspace_id,
                    limit,
                });
            }
        }
        let id = reserved.unwrap_or_else(|| self.reserve_thread_id());
        let handle = ThreadHandle::new(ThreadInner {
            machine: ThreadMachine::new(id.clone()),
            workspace_id: request.workspace_id,
            agent_profile_id: request.agent_profile_id,
            workdir: PathBuf::from(request.workdir),
            workspace_root,
            additional_directories,
            session: None,
            config_options: Vec::new(),
            capabilities: None,
            prepared,
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
        Ok(summary)
    }

    /// One page of Provider sessions under the trusted root (`thread.list_provider_sessions`).
    pub async fn list_provider_sessions(
        &self,
        profile_id: &str,
        workspace_id: &str,
        cursor: Option<&str>,
    ) -> Result<tethys_schema::thread::ProviderSessionPage, ApiError> {
        let key = self.profile_key(profile_id)?;
        let roots = self.roots.read().clone();
        let workspace_root = roots.root(&WorkspaceId::new(workspace_id)).await?;
        let lease = self
            .store
            .acquire(&key)
            .await
            .map_err(|error| map_store_error(&self.health, profile_id, error))?;
        let connection = lease.connection().clone();
        let (listed, next_cursor) = connection
            .list_sessions_page(&workspace_root, cursor)
            .await
            .map_err(|error| map_connection_error(&self.health, profile_id, error))?;
        drop(lease);

        let canonical_root = workspace_root.clone();
        let sessions = tokio::task::spawn_blocking(move || {
            let canonical_root = std::fs::canonicalize(canonical_root)
                .map_err(|error| ApiError::Internal(error.to_string()))?;
            Ok::<_, ApiError>(
                listed
                    .into_iter()
                    .filter_map(|session| {
                        if !session.cwd.is_absolute() {
                            return None;
                        }
                        let cwd = std::fs::canonicalize(&session.cwd).ok()?;
                        cwd.starts_with(&canonical_root).then_some(
                            tethys_schema::thread::ProviderSessionSummary {
                                id: session.id.0,
                                title: session.title,
                                cwd: cwd.display().to_string(),
                                updated_at: session.updated_at,
                            },
                        )
                    })
                    .collect::<Vec<_>>(),
            )
        })
        .await
        .map_err(|error| ApiError::Internal(format!("session list check failed: {error}")))??;

        Ok(tethys_schema::thread::ProviderSessionPage {
            sessions,
            next_cursor,
        })
    }

    /// Connects and creates the ACP session before returning composer controls.
    pub async fn prepare(&self, request: CreateThread) -> Result<ThreadBootstrap, ApiError> {
        self.prepare_as(request, None).await
    }

    /// `prepare` under an id from `reserve_thread_id`.
    pub async fn prepare_as(
        &self,
        request: CreateThread,
        reserved: Option<ThreadId>,
    ) -> Result<ThreadBootstrap, ApiError> {
        let summary = self.create_with_visibility(request, true, reserved).await?;
        let handle = self.handle(&summary.id)?;
        if let Err(error) = self.ensure_connection(&handle).await {
            let _ = self.delete(&summary.id).await;
            return Err(error);
        }
        let (thread, events, config_options, capabilities, session, latest_seq) = {
            let inner = handle.inner.lock();
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

    /// Reconnects an interrupted thread: acquires a fresh lease and resumes the
    /// agent session with replay (recovery rung 3).
    pub async fn resume(&self, id: &ThreadId) -> Result<(), ApiError> {
        let handle = self.handle(id)?;
        {
            let mut inner = handle.inner.lock();
            inner.lease = None;
            inner.machine.mark_resumed();
        }
        self.ensure_connection(&handle).await
    }

    pub async fn archive(&self, id: &ThreadId) -> Result<(), ApiError> {
        let handle = self.handle(id)?;
        if let Ok((connection, session)) = live_connection(&handle) {
            if connection.capabilities().close_session {
                connection
                    .close_session(&session)
                    .await
                    .map_err(|error| ApiError::Internal(error.to_string()))?;
            } else {
                connection
                    .cancel(&session)
                    .await
                    .map_err(|error| ApiError::Internal(error.to_string()))?;
            }
        }
        let lease = {
            let mut inner = handle.inner.lock();
            inner.machine.archive();
            inner.session = None;
            inner.pending_extensions.clear();
            inner.lease.take()
        };
        drop(lease);
        self.persist_thread(&handle).await?;
        Ok(())
    }

    pub async fn delete_provider_session(&self, id: &ThreadId) -> Result<(), ApiError> {
        let handle = self.handle(id)?;
        let (key, session) = {
            let inner = handle.inner.lock();
            let session = inner
                .session
                .clone()
                .ok_or_else(|| ApiError::NotFound("Provider session".into()))?;
            (self.profile_key(&inner.agent_profile_id)?, session)
        };
        let lease = self.store.acquire(&key).await.map_err(|error| {
            let profile_id = handle.inner.lock().agent_profile_id.clone();
            map_store_error(&self.health, &profile_id, error)
        })?;
        let connection = lease.connection().clone();
        let deleter = connection.session_deleter().ok_or_else(|| {
            ApiError::InvalidConfig("provider does not support session deletion".into())
        })?;
        deleter
            .delete_session(&session)
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;
        let thread_lease = {
            let mut inner = handle.inner.lock();
            inner.machine.archive();
            inner.session = None;
            inner.pending_extensions.clear();
            inner.lease.take()
        };
        drop(thread_lease);
        drop(lease);
        self.persist_thread(&handle).await
    }

    pub async fn delete(&self, id: &ThreadId) -> Result<(), ApiError> {
        self.permissions().cancel_thread(id);
        self.archive(id).await?;
        let event_store = self.event_store.read().clone();
        if let Some(store) = event_store {
            store
                .delete_thread(id)
                .await
                .map_err(|error| ApiError::Internal(error.to_string()))?;
        }
        if let Some(handle) = self.threads.lock().remove(id) {
            let session = handle.inner.lock().session.clone();
            if let Some(session) = session {
                self.permissions().unregister_session(&session);
            }
            if let Some(reader) = handle.reader.lock().take() {
                reader.abort();
            }
        }
        Ok(())
    }

    pub fn connections(&self) -> Vec<ConnectionEntry> {
        self.store.entries()
    }

    pub async fn restart_connection(&self, profile_id: &str) -> Result<(), ApiError> {
        let key = self.profile_key(profile_id)?;
        self.store
            .restart(&key)
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))
    }

    pub(super) fn handle(&self, id: &ThreadId) -> Result<Arc<ThreadHandle>, ApiError> {
        self.threads
            .lock()
            .get(id)
            .cloned()
            .ok_or_else(|| ApiError::NotFound(format!("thread {id}")))
    }

    /// Builds the resolved MCP server set for one spawn.
    ///
    /// Secrets are resolved here, at spawn time, and never written to disk,
    /// logs, or events.
    pub(super) fn mcp_servers(
        &self,
        workspace_root: &Path,
        key: &ConnectionKey,
    ) -> Result<Vec<serde_json::Value>, ApiError> {
        let transports = self.transports_for(key)?;
        let resolved = tethys_sync::session::spawn_servers_for_provider(
            &self.sync.home,
            workspace_root,
            Some(key.profile_id.as_str()),
            &self.sync.disabled,
            &transports,
            self.sync.secrets.as_ref(),
        )
        .map_err(|error| ApiError::Internal(error.to_string()))?;
        resolved
            .into_iter()
            .map(|server| {
                serde_json::to_value(server).map_err(|error| ApiError::Internal(error.to_string()))
            })
            .collect()
    }

    pub fn transports_for(&self, key: &ConnectionKey) -> Result<McpTransports, ApiError> {
        let entry = self
            .store
            .entry(key)
            .ok_or_else(|| ApiError::NotFound(format!("connection for {}", key.profile_id)))?;

        let capabilities = entry
            .capabilities
            .ok_or(ApiError::CapabilitiesNotNegotiated)?;

        let mut transports = capabilities.mcp;
        if entry.protocol == Some(AcpProtocol::V1) {
            transports.stdio = true;
        }
        Ok(transports)
    }

    /// Acquires a lease (spawning if needed) and ensures a live session plus
    /// its reader task. New sessions start fresh; replaced connections resume
    /// with replay (D12/D13).
    pub(super) async fn ensure_connection(
        &self,
        handle: &Arc<ThreadHandle>,
    ) -> Result<(), ApiError> {
        let _connect_guard = handle.connect_guard.lock().await;
        let (key, existing_session, workdir, workspace_root, additional_directories) = {
            let inner = handle.inner.lock();
            let key = self.profile_key(&inner.agent_profile_id)?;
            (
                key,
                inner.session.clone(),
                inner.workdir.clone(),
                inner.workspace_root.clone(),
                inner.additional_directories.clone(),
            )
        };

        if let Ok((_, _)) = live_connection(handle) {
            return Ok(());
        }

        let lease = self.store.acquire(&key).await.map_err(|error| {
            let profile_id = handle.inner.lock().agent_profile_id.clone();
            map_store_error(&self.health, &profile_id, error)
        })?;

        let mcp_servers = self.mcp_servers(&workspace_root, &key)?;

        let session_handle = match existing_session {
            Some(session) => {
                let connection = lease.connection();
                if connection.capabilities().resume {
                    connection
                        .resume_session(ResumeSession {
                            session_id: session,
                            cwd: workdir.clone(),
                            additional_directories: additional_directories.clone(),
                            mcp_servers: mcp_servers.clone(),
                            replay: true,
                        })
                        .await
                        .map_err(|error| {
                            let profile_id = handle.inner.lock().agent_profile_id.clone();
                            map_connection_error(&self.health, &profile_id, error)
                        })?
                } else if connection.capabilities().load_session {
                    connection
                        .load_session(ResumeSession {
                            session_id: session,
                            cwd: workdir.clone(),
                            additional_directories: additional_directories.clone(),
                            mcp_servers: mcp_servers.clone(),
                            replay: true,
                        })
                        .await
                        .map_err(|error| {
                            let profile_id = handle.inner.lock().agent_profile_id.clone();
                            map_connection_error(&self.health, &profile_id, error)
                        })?
                } else {
                    // Neither lifecycle call exists: keep the cached transcript
                    // read-only and start a fresh session with a visible notice.
                    let fresh = connection
                        .new_session(NewSession {
                            cwd: workdir,
                            additional_directories,
                            mcp_servers,
                        })
                        .await
                        .map_err(|error| {
                            let profile_id = handle.inner.lock().agent_profile_id.clone();
                            map_connection_error(&self.health, &profile_id, error)
                        })?;
                    let event_store = self.event_store.read().clone();
                    let _ = append_event(
                        handle,
                        event_store,
                        TurnEventBody::Error {
                            code: "provider_cannot_resume".into(),
                            message:
                                "this provider cannot load or resume sessions; a fresh session was started"
                                    .into(),
                            retryable: false,
                        },
                        EventOrigin::Live,
                    )
                    .await;
                    fresh
                }
            }
            None => lease
                .connection()
                .new_session(NewSession {
                    cwd: workdir,
                    additional_directories,
                    mcp_servers,
                })
                .await
                .map_err(|error| {
                    let profile_id = handle.inner.lock().agent_profile_id.clone();
                    map_connection_error(&self.health, &profile_id, error)
                })?,
        };

        let session = session_handle.id.clone();
        let connection = lease.connection().clone();
        let capabilities = self.store.entry(&key).and_then(|entry| entry.capabilities);
        let existing_mode = self
            .permissions()
            .context(&session)
            .map(|context| context.mode);
        {
            let mut inner = handle.inner.lock();
            inner.session = Some(session.clone());
            inner.config_options = session_handle.config_options;
            inner.capabilities = capabilities;
            inner.lease = Some(lease);
        }
        self.persist_thread(handle).await?;
        self.register_permission_context(handle, &session, existing_mode);
        self.start_reader(handle, connection, session);
        Ok(())
    }

    /// Publishes the thread's workspace, isolation and mode to the policy
    /// registry so the injected resolver can decide requests for this session.
    pub(super) fn register_permission_context(
        &self,
        handle: &Arc<ThreadHandle>,
        session: &SessionId,
        existing_mode: Option<tethys_schema::workspace::PermissionMode>,
    ) {
        let (thread_id, workspace_id, workdir, workspace_root) = {
            let inner = handle.inner.lock();
            (
                inner.machine.id().clone(),
                inner.workspace_id.clone(),
                inner.workdir.clone(),
                inner.workspace_root.clone(),
            )
        };
        // A worktree is a linked checkout whose `.git` is a file. A subdirectory
        // of the main checkout (or a caller-supplied path) is not one, so it
        // stays `MainCheckout` and YOLO is refused (SEC-02).
        let is_worktree = workdir != workspace_root && workdir.join(".git").is_file();
        let isolation = if is_worktree {
            Isolation::Worktree
        } else {
            Isolation::MainCheckout
        };
        let is_git = workspace_root.join(".git").exists();
        self.permissions().register_session(
            session,
            ThreadPermissionContext {
                thread_id,
                workspace_id,
                workspace_root,
                workdir,
                isolation,
                is_git,
                mode: existing_mode.unwrap_or(tethys_schema::workspace::PermissionMode::Supervised),
                yolo_opt_in: false,
            },
        );
    }

    pub(super) fn start_reader(
        &self,
        handle: &Arc<ThreadHandle>,
        connection: Arc<AcpConnection>,
        session: SessionId,
    ) {
        if handle.reader.lock().is_some() {
            return;
        }
        let task_handle = handle.clone();
        let permissions = self.permissions();
        let event_store = self.event_store.read().clone();
        let task = tokio::spawn(async move {
            let mut events = connection.events(&session);
            loop {
                tokio::select! {
                    event = events.next() => {
                        let Some(Ok(event)) = event else { break };
                        let origin = if event.replayed { EventOrigin::Replay } else { EventOrigin::Live };
                        if let TurnEventBody::ConfigOptionsChanged { options } = &event.body {
                            let mut inner = task_handle.inner.lock();
                            merge_config_options(&mut inner.config_options, options);
                        }
                        if append_event(&task_handle, event_store.clone(), event.body, origin).await.is_err() {
                            break;
                        }
                    }
                    _ = connection.wait_closed() => break,
                }
            }
            let mut inner = task_handle.inner.lock();
            let thread_id = inner.machine.id().clone();
            if matches!(
                inner.machine.state(),
                tethys_schema::thread::ThreadState::Running
                    | tethys_schema::thread::ThreadState::AwaitingApproval
            ) {
                inner.machine.mark_interrupted();
            }
            inner.lease = None;
            drop(inner);
            // Answer anything parked when the transport died, so no resolver is
            // left awaiting a decision that can never arrive (SEC-07).
            permissions.cancel_thread(&thread_id);
            *task_handle.reader.lock() = None;
        });
        *handle.reader.lock() = Some(task);
    }
}

/// Merges an update into the cached option list.
///
/// Config-option responses containing `model` are complete schemas. A model
/// switch can remove dependent options such as Claude's `effort`; retaining
/// those stale entries makes the next UI selection fail at the provider.
/// Mode notifications are partial updates, so they keep the existing schema.
pub(super) fn merge_config_options(current: &mut Vec<ConfigOption>, incoming: &[ConfigOption]) {
    let complete_schema = incoming
        .iter()
        .any(|option| option.id == "model" || option.category.as_deref() == Some("model"));
    if complete_schema {
        current.retain(|existing| incoming.iter().any(|option| option.id == existing.id));
    }

    for option in incoming {
        match current.iter_mut().find(|existing| existing.id == option.id) {
            Some(existing) => {
                existing.current_value = option.current_value.clone();
                if !option.name.is_empty() {
                    existing.name = option.name.clone();
                }
                if option.description.is_some() {
                    existing.description = option.description.clone();
                }
                if !option.values.is_empty() {
                    existing.values = option.values.clone();
                }
                if !option.value_options.is_empty() {
                    existing.value_options = option.value_options.clone();
                }
                if option.category.is_some() {
                    existing.category = option.category.clone();
                }
                if option.kind.is_some() {
                    existing.kind = option.kind;
                }
            }
            None => current.push(option.clone()),
        }
    }
}

pub(super) fn live_connection(
    handle: &Arc<ThreadHandle>,
) -> Result<(Arc<AcpConnection>, SessionId), ApiError> {
    let inner = handle.inner.lock();
    match (&inner.lease, &inner.session) {
        (Some(lease), Some(session)) => Ok((lease.connection().clone(), session.clone())),
        _ => Err(ApiError::Internal("thread has no live connection".into())),
    }
}
