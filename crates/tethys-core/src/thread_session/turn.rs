use super::lifecycle::{live_connection, merge_config_options};
use super::persistence::{append_event, persist_thread_state};
use super::*;

impl ThreadSessions {
    /// Sends the prompt and returns once it is accepted; the receiver resolves
    /// when the turn settles (completed, failed, or cancelled).
    pub async fn prompt(
        &self,
        id: &ThreadId,
        blocks: Vec<ContentBlock>,
    ) -> Result<oneshot::Receiver<()>, ApiError> {
        let handle = self.handle(id)?;
        if handle.inner.lock().machine.state() == tethys_schema::thread::ThreadState::Archived {
            return Err(ApiError::Conflict(
                "archived thread must be resumed before prompting".into(),
            ));
        }
        self.ensure_connection(&handle).await?;
        let (connection, session) = live_connection(&handle)?;
        {
            let mut inner = handle.inner.lock();
            if inner.prompt_in_flight {
                return Err(ApiError::Conflict("a prompt is already in flight".into()));
            }
            inner.prompt_in_flight = true;
            inner.prepared = false;
        }
        let user_message_id = {
            let inner = handle.inner.lock();
            format!("{}:user:{}", inner.machine.id(), inner.next_seq)
        };
        let event_store = self.event_store.read().clone();
        if let Err(error) = append_event(
            &handle,
            event_store.clone(),
            TurnEventBody::MessageUpsert(MessageUpsert {
                message_id: user_message_id,
                role: Role::User,
                content: Patch::Set(blocks.clone()),
            }),
            EventOrigin::Live,
        )
        .await
        {
            let mut inner = handle.inner.lock();
            inner.prompt_in_flight = false;
            inner.prepared = true;
            return Err(error);
        }
        if let Err(error) = self.persist_thread(&handle).await {
            let mut inner = handle.inner.lock();
            inner.prompt_in_flight = false;
            inner.prepared = true;
            return Err(error);
        }
        let task_handle = handle.clone();
        let permissions = self.permissions();
        let health = self.health.clone();
        let profile_id = handle.inner.lock().agent_profile_id.clone();
        let thread_store = event_store.clone();
        let (settled_tx, settled_rx) = oneshot::channel();
        tokio::spawn(async move {
            let result = connection.prompt(&session, blocks).await;
            if let Some(timer) = task_handle.cancel_timer.lock().take() {
                timer.abort();
            }
            if let Err(error) = result {
                let auth_required = matches!(error, ConnectionError::AuthRequired);
                if auth_required {
                    health.mark_auth_required(&profile_id);
                }
                let thread_id = {
                    let mut inner = task_handle.inner.lock();
                    inner.prompt_in_flight = false;
                    inner.lease = None;
                    inner.machine.id().clone()
                };
                let _ = append_event(
                    &task_handle,
                    event_store.clone(),
                    TurnEventBody::Error {
                        code: if auth_required {
                            "auth_required".into()
                        } else {
                            "prompt_failed".into()
                        },
                        message: error.to_string(),
                        retryable: true,
                    },
                    EventOrigin::Live,
                )
                .await;
                task_handle.inner.lock().machine.mark_interrupted();
                let _ = persist_thread_state(thread_store, &task_handle).await;
                if let Some(reader) = task_handle.reader.lock().take() {
                    reader.abort();
                }
                permissions.cancel_thread(&thread_id);
            }
            let cancel_state = {
                let mut inner = task_handle.inner.lock();
                inner.prompt_in_flight = false;
                if matches!(inner.cancel.phase, CancelPhase::Idle) {
                    None
                } else {
                    inner.cancel.phase = CancelPhase::Idle;
                    Some(inner.cancel.clone())
                }
            };
            if let Some(cancel_state) = cancel_state {
                let _ = append_event(
                    &task_handle,
                    event_store,
                    TurnEventBody::CancelPhaseChanged(cancel_state),
                    EventOrigin::Live,
                )
                .await;
            }
            let _ = settled_tx.send(());
        });
        Ok(settled_rx)
    }

    pub async fn set_config_option(
        &self,
        id: &ThreadId,
        option_id: &str,
        value: &str,
    ) -> Result<(), ApiError> {
        let handle = self.handle(id)?;
        let (is_mode, boolean) = {
            let inner = handle.inner.lock();
            let option = inner
                .config_options
                .iter()
                .find(|option| option.id == option_id)
                .ok_or_else(|| {
                    ApiError::InvalidConfig(format!("unknown config option {option_id}"))
                })?;
            (
                option.category.as_deref() == Some("mode"),
                option.kind == Some(tethys_schema::thread::ConfigOptionKind::Boolean),
            )
        };
        if is_mode {
            let known = {
                let inner = handle.inner.lock();
                inner
                    .config_options
                    .iter()
                    .find(|option| option.id == option_id)
                    .map(|option| option.values.clone())
                    .unwrap_or_default()
            };
            if !known.is_empty() && !known.iter().any(|known| known == value) {
                return Err(ApiError::InvalidConfig(format!("unknown mode {value}")));
            }
        }
        let (connection, session) = live_connection(&handle)?;
        let options = if is_mode {
            connection
                .set_mode(&session, value)
                .await
                .map_err(|error| ApiError::Internal(error.to_string()))?;
            let mut inner = handle.inner.lock();
            if let Some(option) = inner
                .config_options
                .iter_mut()
                .find(|option| option.id == option_id)
            {
                option.current_value = value.to_string();
            }
            inner.config_options.clone()
        } else {
            let value = if boolean {
                serde_json::Value::Bool(value.parse().map_err(|_| {
                    ApiError::InvalidConfig(format!("{option_id} expects true or false"))
                })?)
            } else {
                serde_json::Value::String(value.to_string())
            };
            let options = connection
                .set_config_option(&session, option_id, value)
                .await
                .map_err(|error| ApiError::Internal(error.to_string()))?;
            let mut inner = handle.inner.lock();
            merge_config_options(&mut inner.config_options, &options);
            inner.config_options.clone()
        };
        self.persist_thread(&handle).await?;
        let event_store = self.event_store.read().clone();
        append_event(
            &handle,
            event_store,
            TurnEventBody::ConfigOptionsChanged { options },
            EventOrigin::Live,
        )
        .await?;
        Ok(())
    }

    /// Requests cancellation and advances the M1.6c phase contract (spec §4).
    ///
    /// The backend owns the clock: the first press emits `cancel_requested`
    /// with an absolute grace deadline and sends the protocol cancel; the grace
    /// timer moves to `grace_elapsed` when the window closes. A press while
    /// `grace_elapsed` requests the destructive rung explicitly and emits
    /// `terminating` — a second press during `cancel_requested` does nothing
    /// ("a second click does not advance the ladder").
    pub async fn cancel(&self, id: &ThreadId) -> Result<(), ApiError> {
        let handle = self.handle(id)?;
        self.permissions().cancel_thread(id);

        let phase = handle.inner.lock().cancel.phase.clone();
        match phase {
            CancelPhase::GraceElapsed => {
                let key = self.profile_key(&handle.inner.lock().agent_profile_id)?;
                self.emit_cancel(&handle, CancelPhase::Terminating).await;
                self.store
                    .force_kill(&key)
                    .await
                    .map_err(|error| ApiError::Internal(error.to_string()))?;
                Ok(())
            }
            CancelPhase::CancelRequested { .. } | CancelPhase::Terminating => Ok(()),
            CancelPhase::Idle => {
                // Nothing to cancel when no turn is in flight; do not open a
                // window that can only expire.
                if !matches!(
                    handle.inner.lock().machine.state(),
                    tethys_schema::thread::ThreadState::Running
                        | tethys_schema::thread::ThreadState::AwaitingApproval
                ) {
                    return Ok(());
                }
                let Ok((connection, session)) = live_connection(&handle) else {
                    return Ok(());
                };
                let grace = self.store.cancel_grace();
                let deadline = rfc3339_after(grace);
                self.emit_cancel(
                    &handle,
                    CancelPhase::CancelRequested {
                        grace_deadline: deadline,
                    },
                )
                .await;
                // Armed before the protocol cancel is sent: if that send fails the
                // window still closes into `grace_elapsed` (Force kill is offered)
                // rather than sticking in `cancel_requested`, and a fast settle
                // finds the timer to abort.
                let event_store = self.event_store.read().clone();
                arm_grace_timer(&handle, grace, event_store);
                connection
                    .cancel(&session)
                    .await
                    .map_err(|error| ApiError::Internal(error.to_string()))?;
                Ok(())
            }
        }
    }

    /// The last known cancel phase for a thread (`thread.cancel_state`), so a
    /// subscriber that opens mid-cancel does not wait for the next event.
    pub fn cancel_state(&self, id: &ThreadId) -> Result<CancelState, ApiError> {
        let handle = self.handle(id)?;
        let phase = handle.inner.lock().cancel.clone();
        Ok(phase)
    }

    /// Emits a cancel phase on the same ordered stream as turn events.
    pub(super) async fn emit_cancel(&self, handle: &Arc<ThreadHandle>, phase: CancelPhase) {
        let state = {
            let mut inner = handle.inner.lock();
            inner.cancel.phase = phase;
            inner.cancel.clone()
        };
        let event_store = self.event_store.read().clone();
        let _ = append_event(
            handle,
            event_store,
            TurnEventBody::CancelPhaseChanged(state),
            EventOrigin::Live,
        )
        .await;
    }

    pub async fn respond_extension(
        &self,
        id: &ThreadId,
        request_id: &str,
        response_json: &str,
    ) -> Result<(), ApiError> {
        let response: serde_json::Value = serde_json::from_str(response_json).map_err(|error| {
            ApiError::InvalidConfig(format!("invalid extension response: {error}"))
        })?;
        let handle = self.handle(id)?;
        if !handle.inner.lock().pending_extensions.contains(request_id) {
            return Err(ApiError::NotFound(format!(
                "extension request {request_id}"
            )));
        }
        let (connection, session) = live_connection(&handle)?;
        connection
            .respond_extension(&session, request_id, response)
            .await
            .map_err(|error| ApiError::Internal(error.to_string()))?;
        let event_store = self.event_store.read().clone();
        append_event(
            &handle,
            event_store,
            TurnEventBody::ProviderExtensionResolved {
                request_id: request_id.to_string(),
                cancelled: false,
            },
            EventOrigin::Live,
        )
        .await?;
        Ok(())
    }

    pub async fn provider_control(
        &self,
        id: &ThreadId,
        control: tethys_schema::thread::ProviderControl,
    ) -> Result<tethys_schema::thread::ProviderControlResult, ApiError> {
        validate_provider_control(&control)?;
        let handle = self.handle(id)?;
        self.ensure_connection(&handle).await?;
        let (connection, session) = live_connection(&handle)?;
        connection
            .provider_control(&session, control)
            .await
            .map_err(|error| {
                let profile_id = handle.inner.lock().agent_profile_id.clone();
                map_connection_error(&self.health, &profile_id, error)
            })
    }
}

pub(super) fn validate_provider_control(
    control: &tethys_schema::thread::ProviderControl,
) -> Result<(), ApiError> {
    use tethys_schema::thread::ProviderControl;

    let ProviderControl::SetProvider {
        provider_id,
        api_type,
        base_url,
        headers,
    } = control
    else {
        if let ProviderControl::DisableProvider { provider_id } = control {
            if provider_id.trim().is_empty()
                || provider_id.len() > 200
                || provider_id.chars().any(char::is_control)
            {
                return Err(ApiError::InvalidConfig("invalid provider id".into()));
            }
        }
        return Ok(());
    };

    let parsed = url::Url::parse(base_url)
        .map_err(|_| ApiError::InvalidConfig("invalid provider base URL".into()))?;
    let mut names = std::collections::HashSet::new();
    let headers_size = headers
        .iter()
        .map(|header| header.name.len() + header.value.len())
        .sum::<usize>();
    if provider_id.trim().is_empty()
        || provider_id.len() > 200
        || provider_id.chars().any(char::is_control)
        || api_type.trim().is_empty()
        || api_type.len() > 128
        || api_type.chars().any(char::is_control)
        || !matches!(parsed.scheme(), "http" | "https")
        || parsed.host().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || base_url.len() > 2048
        || headers.len() > 64
        || headers_size > 16_384
        || headers.iter().any(|header| {
            header.name.is_empty()
                || header.name.len() > 256
                || !header
                    .name
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "!#$%&'*+-.^_`|~".contains(c))
                || header.value.len() > 8192
                || header.value.chars().any(char::is_control)
                || !names.insert(header.name.to_ascii_lowercase())
        })
    {
        return Err(ApiError::InvalidConfig(
            "invalid provider routing configuration".into(),
        ));
    }
    Ok(())
}

/// Moves the thread to `grace_elapsed` when the window closes unanswered.
fn arm_grace_timer(
    handle: &Arc<ThreadHandle>,
    grace: std::time::Duration,
    event_store: Option<Arc<EventStore>>,
) {
    let timer_handle = handle.clone();
    let task = tokio::spawn(async move {
        tokio::time::sleep(grace).await;
        let state = {
            let mut inner = timer_handle.inner.lock();
            if !matches!(inner.cancel.phase, CancelPhase::CancelRequested { .. }) {
                return;
            }
            inner.cancel.phase = CancelPhase::GraceElapsed;
            inner.cancel.clone()
        };
        let _ = append_event(
            &timer_handle,
            event_store,
            TurnEventBody::CancelPhaseChanged(state),
            EventOrigin::Live,
        )
        .await;
    });
    *handle.cancel_timer.lock() = Some(task);
}

/// RFC 3339 instant `grace` after now, for `CancelPhase::CancelRequested`.
fn rfc3339_after(grace: std::time::Duration) -> String {
    let deadline =
        time::OffsetDateTime::now_utc() + time::Duration::seconds_f64(grace.as_secs_f64().max(0.0));
    deadline
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default()
}
