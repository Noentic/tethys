use tethys_schema::thread::{
    Entry, Patch, PermOutcome, PermissionRequested, Role, SessionState, StateChanged, StopReason,
    ThreadId, ThreadState, TurnEventBody,
};
use tethys_thread::{EventOrigin, SessionId, ThreadMachine};

fn running() -> TurnEventBody {
    TurnEventBody::StateChanged(StateChanged {
        state: SessionState::Running,
    })
}

fn idle(reason: StopReason) -> TurnEventBody {
    TurnEventBody::StateChanged(StateChanged {
        state: SessionState::Idle {
            stop_reason: Some(reason),
        },
    })
}

fn chunk(message_id: &str, text: &str) -> TurnEventBody {
    TurnEventBody::MessageChunk(tethys_schema::thread::MessageChunk {
        message_id: message_id.into(),
        role: Role::Agent,
        block: tethys_schema::thread::ContentBlock::Text(text.into()),
    })
}

#[test]
fn running_then_idle_produces_one_turn_with_start_and_end() {
    let mut machine = ThreadMachine::new(ThreadId::from("t1"));
    machine.set_session(SessionId::from("s1"));

    machine.apply(1, &running(), EventOrigin::Live);
    machine.apply(2, &chunk("m1", "hello"), EventOrigin::Live);
    machine.apply(3, &idle(StopReason::EndTurn), EventOrigin::Live);

    assert_eq!(machine.state(), ThreadState::Idle);
    assert_eq!(machine.turns().len(), 1);
    let turn = &machine.turns()[0];
    assert_eq!(turn.started_seq, 1);
    assert_eq!(turn.ended_seq, Some(3));
    assert_eq!(turn.stop_reason, Some(StopReason::EndTurn));
    assert_eq!(machine.latest_seq(), 3);
}

#[test]
fn permission_request_parks_and_resolution_returns_to_running() {
    let mut machine = ThreadMachine::new(ThreadId::from("t1"));
    machine.apply(1, &running(), EventOrigin::Live);
    machine.apply(
        2,
        &TurnEventBody::PermissionRequested(PermissionRequested {
            req_id: "req-1".into(),
            title: "Run cargo check?".into(),
            description: None,
            subject: None,
            options: vec![],
            metadata: None,
        }),
        EventOrigin::Live,
    );

    assert_eq!(machine.state(), ThreadState::AwaitingApproval);
    assert!(matches!(machine.entries()[0], Entry::Permission { .. }));

    machine.apply(
        3,
        &TurnEventBody::PermissionResolved {
            req_id: "req-1".into(),
            outcome: PermOutcome::Approved,
            decided_by: tethys_schema::thread::Decider::User,
            option_id: Some("allow".into()),
        },
        EventOrigin::Live,
    );

    assert_eq!(machine.state(), ThreadState::Running);
    match &machine.entries()[0] {
        Entry::Permission { outcome, .. } => assert_eq!(*outcome, Some(PermOutcome::Approved)),
        other => panic!("expected permission entry, got {other:?}"),
    }
}

#[test]
fn process_death_mid_turn_marks_interrupted_with_entries_retained() {
    let mut machine = ThreadMachine::new(ThreadId::from("t1"));
    machine.apply(1, &running(), EventOrigin::Live);
    machine.apply(2, &chunk("m1", "partial"), EventOrigin::Live);

    machine.mark_interrupted();

    assert_eq!(machine.state(), ThreadState::Interrupted);
    assert_eq!(machine.turns()[0].ended_seq, Some(2));
    assert_eq!(machine.entries().len(), 1);

    let id = machine.id().clone();
    assert_eq!(id.as_str(), "t1");
}

#[test]
fn message_upsert_patch_semantics() {
    let mut machine = ThreadMachine::new(ThreadId::from("t1"));
    machine.apply(1, &running(), EventOrigin::Live);
    machine.apply(2, &chunk("m1", "first"), EventOrigin::Live);

    let upsert = |content: Patch<Vec<tethys_schema::thread::ContentBlock>>| {
        TurnEventBody::MessageUpsert(tethys_schema::thread::MessageUpsert {
            message_id: "m1".into(),
            role: Role::Agent,
            content,
        })
    };

    machine.apply(3, &upsert(Patch::Unchanged), EventOrigin::Live);
    let text = message_text(machine.entries());
    assert_eq!(text, "first");

    machine.apply(
        4,
        &upsert(Patch::Set(vec![tethys_schema::thread::ContentBlock::Text(
            "replaced".into(),
        )])),
        EventOrigin::Live,
    );
    assert_eq!(message_text(machine.entries()), "replaced");

    machine.apply(5, &upsert(Patch::Clear), EventOrigin::Live);
    assert_eq!(message_text(machine.entries()), "");
}

#[test]
fn replay_does_not_duplicate_or_rewind_entries() {
    let mut machine = ThreadMachine::new(ThreadId::from("t1"));
    machine.apply(1, &running(), EventOrigin::Live);
    machine.apply(2, &chunk("m1", "hello "), EventOrigin::Live);
    machine.apply(3, &chunk("m1", "world"), EventOrigin::Live);
    machine.apply(4, &idle(StopReason::EndTurn), EventOrigin::Live);

    machine.apply(1, &running(), EventOrigin::Replay);
    machine.apply(2, &chunk("m1", "hello "), EventOrigin::Replay);
    machine.apply(3, &chunk("m1", "world"), EventOrigin::Replay);
    machine.apply(
        4,
        &TurnEventBody::MessageUpsert(tethys_schema::thread::MessageUpsert {
            message_id: "m1".into(),
            role: Role::Agent,
            content: Patch::Set(vec![tethys_schema::thread::ContentBlock::Text(
                "old".into(),
            )]),
        }),
        EventOrigin::Replay,
    );

    assert_eq!(machine.entries().len(), 1);
    assert_eq!(message_text(machine.entries()), "hello world");
    assert_eq!(machine.state(), ThreadState::Idle);
    assert_eq!(machine.turns().len(), 1, "replay must not open a turn");
}

#[test]
fn error_event_sets_error_state_and_entry() {
    let mut machine = ThreadMachine::new(ThreadId::from("t1"));
    machine.apply(1, &running(), EventOrigin::Live);
    machine.apply(
        2,
        &TurnEventBody::Error {
            code: "EPIPE".into(),
            message: "agent died".into(),
            retryable: true,
        },
        EventOrigin::Live,
    );

    assert_eq!(machine.state(), ThreadState::Error);
    assert!(matches!(machine.entries()[0], Entry::Error { .. }));
}

fn message_text(entries: &[Entry]) -> String {
    entries
        .iter()
        .find_map(|entry| match entry {
            Entry::Message { blocks, .. } => Some(
                blocks
                    .iter()
                    .filter_map(|block| match block {
                        tethys_schema::thread::ContentBlock::Text(text) => Some(text.as_str()),
                        _ => None,
                    })
                    .collect::<String>(),
            ),
            _ => None,
        })
        .unwrap_or_default()
}
