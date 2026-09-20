//! Benchmark helper commands (non-§12.1).

use tauri::ipc::Channel;
use tauri::State;
use tethys_api::BenchApi;
use tethys_schema::{BenchmarkConfig, BenchmarkResult, DiffHunk, StreamChunk};

use crate::commands::CoreState;

/// `git.diff.synthetic` — S0.1 diff benchmark generator.
#[tauri::command]
#[specta::specta]
pub async fn generate_synthetic_diff(
    state: State<'_, CoreState>,
    line_count: usize,
) -> Result<Vec<DiffHunk>, String> {
    state
        .generate_synthetic_diff(line_count)
        .await
        .map_err(|e| e.to_string())
}

/// `bench.stream` — S0.1 IPC channel streaming.
#[tauri::command]
pub async fn run_stream_benchmark(
    config: BenchmarkConfig,
    on_chunk: Channel<StreamChunk>,
) -> Result<BenchmarkResult, String> {
    let start = std::time::Instant::now();
    let total_per_stream = config.total_messages / config.streams.max(1);
    let mut handles = Vec::new();

    for stream_id in 0..config.streams {
        let channel = on_chunk.clone();
        let payload_size = config.message_size_bytes as usize;
        let chunks = tethys_core::synthetic::generate_stream_chunks(
            stream_id,
            total_per_stream,
            payload_size,
        );

        handles.push(tokio::spawn(async move {
            for chunk in chunks {
                let _ = channel.send(chunk);
            }
        }));
    }

    for h in handles {
        let _ = h.await;
    }

    let elapsed = start.elapsed();
    let elapsed_ms = elapsed.as_secs_f64() * 1000.0;
    let msgs_per_sec = (config.total_messages as f64) / elapsed.as_secs_f64().max(0.001);

    Ok(BenchmarkResult {
        total_messages: config.total_messages,
        elapsed_ms,
        messages_per_sec: msgs_per_sec,
        p95_latency_ms: elapsed_ms / (config.total_messages as f64).max(1.0),
    })
}
