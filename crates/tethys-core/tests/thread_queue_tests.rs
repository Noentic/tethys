//! Prompt-queue persistence (`CMP-05`): add/list/reorder/remove and restart.

use tethys_core::thread_queue;
use tethys_schema::thread::{ContentBlock, ThreadId};
use tethys_store::EventStore;

fn blocks(text: &str) -> Vec<ContentBlock> {
    vec![ContentBlock::Text(text.into())]
}

fn texts(queue: &[tethys_schema::queue::QueuedPrompt]) -> Vec<String> {
    queue
        .iter()
        .map(|item| match &item.blocks[0] {
            ContentBlock::Text(text) => text.clone(),
            other => panic!("expected text block, got {other:?}"),
        })
        .collect()
}

#[tokio::test]
async fn add_lists_in_insertion_order_per_thread() {
    let store = EventStore::in_memory().await.expect("store");
    let t1 = ThreadId::from("t1");
    let t2 = ThreadId::from("t2");

    let first = thread_queue::add(&store, &t1, "ws", "/tmp", blocks("first"))
        .await
        .expect("add first");
    let second = thread_queue::add(&store, &t1, "ws", "/tmp", blocks("second"))
        .await
        .expect("add second");
    thread_queue::add(&store, &t2, "ws", "/tmp", blocks("other"))
        .await
        .expect("add other");

    assert_eq!(first.ordinal, 0);
    assert_eq!(second.ordinal, 1);

    let queue = thread_queue::list(&store, &t1).await.expect("list");
    assert_eq!(texts(&queue), vec!["first", "second"]);
    assert_eq!(queue[0].ordinal, 0);
    assert_eq!(queue[1].ordinal, 1);

    let other = thread_queue::list(&store, &t2).await.expect("list other");
    assert_eq!(texts(&other), vec!["other"]);
}

#[tokio::test]
async fn reorder_then_remove_preserves_the_rest() {
    let store = EventStore::in_memory().await.expect("store");
    let thread = ThreadId::from("t1");

    let first = thread_queue::add(&store, &thread, "ws", "/tmp", blocks("a"))
        .await
        .expect("add a");
    let second = thread_queue::add(&store, &thread, "ws", "/tmp", blocks("b"))
        .await
        .expect("add b");
    let third = thread_queue::add(&store, &thread, "ws", "/tmp", blocks("c"))
        .await
        .expect("add c");

    thread_queue::reorder(
        &store,
        &thread,
        vec![third.id.clone(), first.id.clone(), second.id.clone()],
    )
    .await
    .expect("reorder");
    let queue = thread_queue::list(&store, &thread).await.expect("list");
    assert_eq!(texts(&queue), vec!["c", "a", "b"]);

    thread_queue::remove(&store, &thread, &first.id)
        .await
        .expect("remove");
    let queue = thread_queue::list(&store, &thread).await.expect("list");
    assert_eq!(texts(&queue), vec!["c", "b"]);
}

#[tokio::test]
async fn queue_survives_a_store_reopen() {
    let dir = tempfile::tempdir().expect("tempdir");
    let db = dir.path().join("state.db");
    let thread = ThreadId::from("t1");

    {
        let store = EventStore::open(&db).await.expect("open");
        thread_queue::add(&store, &thread, "ws", "/tmp", blocks("kept"))
            .await
            .expect("add");
    }

    let reopened = EventStore::open(&db).await.expect("reopen");
    let queue = thread_queue::list(&reopened, &thread).await.expect("list");
    assert_eq!(texts(&queue), vec!["kept"]);
}
