use async_trait::async_trait;
use futures::stream::StreamExt;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use tethys_schema::connection::{AgentInfo, NormalizedCapabilities};
use tethys_schema::thread::{
    ConfigOption, ContentBlock, Decider, PermOutcome, PermissionRequested, TurnEventBody,
};
use tethys_thread::{
    AgentConnection, ConnectionError, ConnectionEvent, EventStream, NewSession, PermissionDecision,
    PermissionResolver, ResumeSession, SessionDeleter, SessionHandle, SessionId, SessionSummary,
};
use tokio::sync::mpsc;

struct FakeConnection {
    info: AgentInfo,
    capabilities: NormalizedCapabilities,
    senders: Mutex<HashMap<SessionId, mpsc::UnboundedSender<ConnectionEvent>>>,
    receivers: Mutex<HashMap<SessionId, mpsc::UnboundedReceiver<ConnectionEvent>>>,
}

impl FakeConnection {
    fn new() -> Self {
        Self {
            info: AgentInfo {
                name: "fake".into(),
                version: "0.0.0".into(),
                title: None,
            },
            capabilities: NormalizedCapabilities {
                load_session: true,
                resume: true,
                mcp_stdio: false,
                prompt_embedded_context: false,
            },
            senders: Mutex::new(HashMap::new()),
            receivers: Mutex::new(HashMap::new()),
        }
    }

    fn send(&self, session: &SessionId, event: ConnectionEvent) {
        self.senders
            .lock()
            .expect("senders")
            .get(session)
            .expect("session exists")
            .send(event)
            .expect("stream alive");
    }
}

#[async_trait]
impl AgentConnection for FakeConnection {
    fn info(&self) -> &AgentInfo {
        &self.info
    }

    fn capabilities(&self) -> &NormalizedCapabilities {
        &self.capabilities
    }

    async fn new_session(&self, _request: NewSession) -> Result<SessionHandle, ConnectionError> {
        let id = SessionId::new(format!(
            "s{}",
            self.senders.lock().expect("senders").len() + 1
        ));
        let (tx, rx) = mpsc::unbounded_channel();
        self.senders.lock().expect("senders").insert(id.clone(), tx);
        self.receivers
            .lock()
            .expect("receivers")
            .insert(id.clone(), rx);
        Ok(SessionHandle {
            id,
            config_options: vec![],
        })
    }

    async fn resume_session(
        &self,
        request: ResumeSession,
    ) -> Result<SessionHandle, ConnectionError> {
        if !self
            .senders
            .lock()
            .expect("senders")
            .contains_key(&request.session_id)
        {
            return Err(ConnectionError::SessionNotFound(request.session_id.0));
        }
        Ok(SessionHandle {
            id: request.session_id,
            config_options: vec![],
        })
    }

    async fn list_sessions(&self, _cwd: &Path) -> Result<Vec<SessionSummary>, ConnectionError> {
        Ok(vec![])
    }

    async fn close_session(&self, id: &SessionId) -> Result<(), ConnectionError> {
        self.senders.lock().expect("senders").remove(id);
        self.receivers.lock().expect("receivers").remove(id);
        Ok(())
    }

    async fn prompt(
        &self,
        _id: &SessionId,
        _blocks: Vec<ContentBlock>,
    ) -> Result<(), ConnectionError> {
        Ok(())
    }

    async fn cancel(&self, _id: &SessionId) -> Result<(), ConnectionError> {
        Ok(())
    }

    async fn set_config_option(
        &self,
        _id: &SessionId,
        _config_id: &str,
        _value: serde_json::Value,
    ) -> Result<Vec<ConfigOption>, ConnectionError> {
        Ok(vec![])
    }

    fn events(&self, id: &SessionId) -> EventStream {
        let rx = self
            .receivers
            .lock()
            .expect("receivers")
            .remove(id)
            .expect("events requested once per session");
        Box::pin(futures::stream::unfold(rx, |mut rx| async move {
            rx.recv().await.map(|event| (Ok(event), rx))
        }))
    }

    fn session_deleter(&self) -> Option<&dyn SessionDeleter> {
        None
    }
}

fn chunk(text: &str) -> ConnectionEvent {
    ConnectionEvent {
        body: TurnEventBody::MessageChunk(tethys_schema::thread::MessageChunk {
            message_id: "m".into(),
            role: tethys_schema::thread::Role::Agent,
            block: ContentBlock::Text(text.into()),
        }),
        replayed: false,
    }
}

fn text_of(event: Option<Result<ConnectionEvent, ConnectionError>>) -> String {
    match event.expect("event").expect("ok").body {
        TurnEventBody::MessageChunk(chunk) => match chunk.block {
            ContentBlock::Text(text) => text,
            other => panic!("expected text block, got {other:?}"),
        },
        other => panic!("expected chunk, got {other:?}"),
    }
}

async fn session(connection: &dyn AgentConnection, cwd: &str) -> SessionId {
    connection
        .new_session(NewSession {
            cwd: cwd.into(),
            additional_directories: vec![],
            mcp_servers: vec![],
        })
        .await
        .expect("new session")
        .id
}

#[tokio::test]
async fn sessions_stream_their_own_events_in_order() {
    let fake = FakeConnection::new();
    let s1 = session(&fake, "/tmp/one").await;
    let s2 = session(&fake, "/tmp/two").await;

    fake.send(&s1, chunk("a1"));
    fake.send(&s1, chunk("a2"));
    fake.send(&s2, chunk("b1"));

    // The trait is dyn-safe: an `Arc<dyn AgentConnection>` drives it.
    let boxed: std::sync::Arc<dyn AgentConnection> = std::sync::Arc::new(fake);
    let mut events1 = boxed.events(&s1);
    let mut events2 = boxed.events(&s2);

    assert_eq!(text_of(events1.next().await), "a1");
    assert_eq!(text_of(events2.next().await), "b1");
    assert_eq!(text_of(events1.next().await), "a2");
}

#[tokio::test]
async fn unsupported_defaults_are_typed() {
    struct Minimal;

    #[async_trait]
    impl AgentConnection for Minimal {
        fn info(&self) -> &AgentInfo {
            static INFO: std::sync::OnceLock<AgentInfo> = std::sync::OnceLock::new();
            INFO.get_or_init(|| AgentInfo {
                name: "minimal".into(),
                version: "0".into(),
                title: None,
            })
        }

        fn capabilities(&self) -> &NormalizedCapabilities {
            static CAPS: std::sync::OnceLock<NormalizedCapabilities> = std::sync::OnceLock::new();
            CAPS.get_or_init(NormalizedCapabilities::default)
        }

        async fn new_session(&self, _: NewSession) -> Result<SessionHandle, ConnectionError> {
            Err(ConnectionError::Unsupported("new_session"))
        }

        async fn resume_session(&self, _: ResumeSession) -> Result<SessionHandle, ConnectionError> {
            Err(ConnectionError::Unsupported("resume_session"))
        }

        async fn close_session(&self, _: &SessionId) -> Result<(), ConnectionError> {
            Err(ConnectionError::Unsupported("close_session"))
        }

        async fn prompt(&self, _: &SessionId, _: Vec<ContentBlock>) -> Result<(), ConnectionError> {
            Err(ConnectionError::Unsupported("prompt"))
        }

        async fn cancel(&self, _: &SessionId) -> Result<(), ConnectionError> {
            Err(ConnectionError::Unsupported("cancel"))
        }

        fn events(&self, _: &SessionId) -> EventStream {
            Box::pin(futures::stream::empty())
        }
    }

    let connection = Minimal;
    match connection.list_sessions(Path::new("/tmp")).await {
        Err(ConnectionError::Unsupported(m)) => assert_eq!(m, "list_sessions"),
        other => panic!("expected Unsupported, got {other:?}"),
    }
    match connection.login("token").await {
        Err(ConnectionError::Unsupported(m)) => assert_eq!(m, "login"),
        other => panic!("expected Unsupported, got {other:?}"),
    }
    match connection
        .set_config_option(&SessionId::new("s"), "mode", serde_json::json!("plan"))
        .await
    {
        Err(ConnectionError::Unsupported(m)) => assert_eq!(m, "set_config_option"),
        other => panic!("expected Unsupported, got {other:?}"),
    }
    assert!(connection.session_deleter().is_none());
    assert!(!connection.capabilities().resume);
}

#[tokio::test]
async fn permission_resolver_is_dyn_and_returns_typed_decision() {
    struct AutoApprove;

    #[async_trait]
    impl PermissionResolver for AutoApprove {
        async fn resolve(&self, request: PermissionRequested) -> PermissionDecision {
            PermissionDecision {
                outcome: PermOutcome::Approved,
                option_id: request
                    .options
                    .first()
                    .map(|option| option.option_id.clone()),
                decided_by: Decider::Policy,
            }
        }
    }

    let resolver: std::sync::Arc<dyn PermissionResolver> = std::sync::Arc::new(AutoApprove);
    let request = PermissionRequested {
        req_id: "r1".into(),
        title: "Run cargo check?".into(),
        description: None,
        subject: None,
        options: vec![tethys_schema::thread::PermOption {
            option_id: "allow".into(),
            name: "Allow".into(),
            kind: None,
        }],
    };

    let decision = resolver.resolve(request).await;
    assert_eq!(decision.outcome, PermOutcome::Approved);
    assert_eq!(decision.option_id.as_deref(), Some("allow"));
    assert_eq!(decision.decided_by, Decider::Policy);
}
