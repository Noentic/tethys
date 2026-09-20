use tethys_api::ThreadApi;
use tethys_schema::thread::ThreadId;

use super::{assert_unimplemented, sample_create_thread, MinimalApi};

#[tokio::test]
async fn thread_defaults_return_unimplemented() {
    let api = MinimalApi;
    assert_unimplemented(
        "thread.create",
        api.thread_create(sample_create_thread()).await,
    );
    assert_unimplemented("thread.list", api.thread_list().await);
    assert_unimplemented("thread.get", api.thread_get(ThreadId::from("t1")).await);
    assert_unimplemented(
        "thread.prompt",
        api.thread_prompt(ThreadId::from("t1"), vec![]).await,
    );
    assert_unimplemented(
        "thread.queue_list",
        api.thread_queue_list(ThreadId::from("t1")).await,
    );
    assert_unimplemented(
        "thread.queue_add",
        api.thread_queue_add(ThreadId::from("t1"), vec![]).await,
    );
    assert_unimplemented(
        "thread.queue_remove",
        api.thread_queue_remove(ThreadId::from("t1"), "q-1".into())
            .await,
    );
    assert_unimplemented(
        "thread.queue_reorder",
        api.thread_queue_reorder(ThreadId::from("t1"), vec![]).await,
    );
    assert_unimplemented(
        "thread.cancel",
        api.thread_cancel(ThreadId::from("t1")).await,
    );
    assert_unimplemented(
        "thread.cancel_state",
        api.thread_cancel_state(ThreadId::from("t1")).await,
    );
    assert_unimplemented(
        "thread.resume",
        api.thread_resume(ThreadId::from("t1")).await,
    );
    assert_unimplemented("thread.import_sessions", api.thread_import_sessions().await);
    assert_unimplemented("thread.fork", api.thread_fork().await);
    assert_unimplemented(
        "thread.archive",
        api.thread_archive(ThreadId::from("t1")).await,
    );
    assert_unimplemented(
        "thread.delete",
        api.thread_delete(ThreadId::from("t1")).await,
    );
    assert_unimplemented(
        "thread.set_config_option",
        api.thread_set_config_option(ThreadId::from("t1"), "model".into(), "sonnet".into())
            .await,
    );
    assert_unimplemented(
        "thread.set_permission_mode",
        api.thread_set_permission_mode(
            ThreadId::from("t1"),
            tethys_schema::workspace::PermissionMode::Supervised,
        )
        .await,
    );
}
