use tethys_api::{ApiError, EventsApi};
use tethys_schema::thread::ThreadId;

use super::{assert_unimplemented, MinimalApi};

#[tokio::test]
async fn events_defaults_return_unimplemented() {
    let api = MinimalApi;
    match api.events_subscribe(ThreadId::from("t1"), 0).await {
        Err(ApiError::Unimplemented(m)) => assert_eq!(m, "events.subscribe"),
        Err(other) => panic!("expected Unimplemented, got {other:?}"),
        Ok(_) => panic!("expected Unimplemented, got a stream"),
    }
    assert_unimplemented(
        "events.unsubscribe",
        api.events_unsubscribe(ThreadId::from("t1")).await,
    );
    assert_unimplemented("events.inbox_subscribe", api.events_inbox_subscribe().await);
}
