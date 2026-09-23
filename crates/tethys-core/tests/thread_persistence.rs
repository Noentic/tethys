use std::sync::Arc;

use tethys_agent_servers::{ConnectionStore, LaunchSpec, StoreOptions};
use tethys_core::permission::DenyPermissionResolver;
use tethys_core::thread_session::{SyncSource, ThreadSessions};
use tethys_core::workspace_roots::StaticWorkspaces;
use tethys_schema::connection::{AcpProtocol, AgentCompat};
use tethys_schema::store::{NewEvent, ThreadId};
use tethys_schema::thread::{
    ContentBlock, MessageUpsert, Patch, Role, ThreadState, ThreadSummary, TurnEventBody,
};
use tethys_store::{EventStore, ThreadRecord};
use tethys_sync::MemorySecrets;

fn sessions(home: &std::path::Path, root: &std::path::Path) -> Arc<ThreadSessions> {
    let connections = ConnectionStore::new(StoreOptions::new(
        AcpProtocol::V1,
        Arc::new(DenyPermissionResolver),
    ));
    Arc::new(ThreadSessions::new(
        connections,
        SyncSource::new(home, Arc::new(MemorySecrets::new())),
        Arc::new(StaticWorkspaces::new().with("ws", root)),
    ))
}

#[tokio::test]
async fn committed_thread_rehydrates_identity_and_history() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path().join("workspace");
    std::fs::create_dir_all(&root).expect("workspace");
    let event_store = Arc::new(EventStore::in_memory().await.expect("event store"));
    let first = sessions(dir.path(), &root);
    first.set_event_store(event_store.clone());
    let profile_id = first.register_profile(
        LaunchSpec::new("claude", "/bin/echo"),
        AgentCompat {
            preferred_protocol: Some(AcpProtocol::V1),
            ..Default::default()
        },
    );
    let thread = first
        .create(tethys_schema::thread::CreateThread {
            workspace_id: "ws".into(),
            agent_profile_id: profile_id.clone(),
            workdir: root.display().to_string(),
            additional_directories: Vec::new(),
            isolation: None,
        })
        .await
        .expect("create thread");
    let events = [
        TurnEventBody::MessageUpsert(MessageUpsert {
            message_id: "message-1".into(),
            role: Role::Agent,
            content: Patch::Set(vec![ContentBlock::Text("persisted reply".into())]),
        }),
        TurnEventBody::StateChanged(tethys_schema::thread::StateChanged {
            state: tethys_schema::thread::SessionState::Idle { stop_reason: None },
        }),
    ]
    .into_iter()
    .map(|body| NewEvent {
        kind: "thread.event".into(),
        payload: serde_json::to_string(&body).expect("event json"),
        entry: None,
    })
    .collect::<Vec<_>>();
    event_store
        .append_batch(&thread.id, &events)
        .await
        .expect("append events");

    let restarted = sessions(dir.path(), &root);
    restarted.set_event_store(event_store);
    restarted.hydrate_threads().await.expect("hydrate");
    let view = restarted.get(&thread.id).await.expect("reopened view");
    assert_eq!(view.thread.agent_profile_id, profile_id);
    assert_eq!(view.thread.state, ThreadState::Idle);
    assert_eq!(view.latest_seq, 2);
    assert!(matches!(
        &view.events[0].event,
        TurnEventBody::MessageUpsert(MessageUpsert {
            content: Patch::Set(blocks),
            ..
        }) if blocks == &[ContentBlock::Text("persisted reply".into())]
    ));
}

#[tokio::test]
async fn startup_removes_unprompted_drafts() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path().join("workspace");
    std::fs::create_dir_all(&root).expect("workspace");
    let event_store = Arc::new(EventStore::in_memory().await.expect("event store"));
    event_store
        .ensure_workspace("ws", &root.display().to_string(), "main")
        .await
        .expect("workspace row");
    event_store
        .save_thread(ThreadRecord {
            summary: ThreadSummary {
                id: ThreadId::new("thread-draft"),
                workspace_id: "ws".into(),
                agent_profile_id: "profile".into(),
                title: "Untitled".into(),
                workdir: root.display().to_string(),
                state: ThreadState::Idle,
                session_id: None,
            },
            workdir: root.display().to_string(),
            additional_directories: Vec::new(),
            config_options: Vec::new(),
            capabilities: None,
            prepared: true,
            latest_seq: 0,
        })
        .await
        .expect("save draft");

    let restarted = sessions(dir.path(), &root);
    restarted.set_event_store(event_store.clone());
    restarted.hydrate_threads().await.expect("hydrate");
    assert!(restarted.list().is_empty());
    assert!(event_store
        .list_threads()
        .await
        .expect("list stored threads")
        .is_empty());
}
