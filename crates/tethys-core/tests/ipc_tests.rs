use tethys_core::synthetic::{generate_stream_chunks, generate_synthetic_diff};
use tokio::sync::mpsc;

#[tokio::test]
async fn test_ipc_stream_channel_flow() {
    let (tx, mut rx) = mpsc::channel::<tethys_schema::StreamChunk>(32);
    let chunks = generate_stream_chunks(0, 10, 64);
    assert_eq!(chunks.len(), 10);

    for chunk in chunks {
        tx.send(chunk).await.unwrap();
    }
    drop(tx);

    let mut count = 0;
    while let Some(chunk) = rx.recv().await {
        assert_eq!(chunk.stream_id, 0);
        count += 1;
    }
    assert_eq!(count, 10);
}

#[test]
fn test_synthetic_diff_generation() {
    let hunks = generate_synthetic_diff(100);
    let total_lines: usize = hunks.iter().map(|h| h.lines.len()).sum();
    assert_eq!(total_lines, 100);
}

#[tokio::test]
async fn test_core_stub_returns_unimplemented() {
    use tethys_api::{ApiError, WorkspaceApi};
    let core = tethys_core::Core::new("0.0.0");
    match core.workspace_settings_get().await {
        Err(ApiError::Unimplemented(m)) => assert_eq!(m, "workspace.settings_get"),
        other => panic!("expected Unimplemented, got {other:?}"),
    }
    let err_str = core.workspace_settings_get().await.map_err(|e| e.to_string()).unwrap_err();
    assert_eq!(err_str, "UNIMPLEMENTED: workspace.settings_get");
}
