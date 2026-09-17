use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tethys_core::synthetic::{generate_stream_chunks, generate_synthetic_diff};
use tokio::sync::mpsc;

#[tokio::test]
async fn test_ipc_8_stream_throughput_and_latency() {
    let num_streams: u32 = 8;
    let msgs_per_stream: u32 = 2500;
    let total_messages = (num_streams * msgs_per_stream) as usize;
    let payload_size = 200; // 200-byte small message per architecture §8.2

    let (tx, mut rx) = mpsc::channel::<tethys_schema::StreamChunk>(1024);
    let received_count = Arc::new(AtomicUsize::new(0));

    let start_time = Instant::now();

    // Receiver task simulating webview event queue processing with latency recording
    let count_clone = received_count.clone();
    let receiver_handle = tokio::spawn(async move {
        let mut latencies_us = Vec::with_capacity(total_messages);
        while let Some(chunk) = rx.recv().await {
            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs_f64()
                * 1000.0;
            let latency = (now_ms - chunk.timestamp_ms).max(0.0);
            latencies_us.push((latency * 1000.0) as u64);
            count_clone.fetch_add(1, Ordering::Relaxed);
        }
        latencies_us
    });

    // 8 concurrent sender streams
    let mut senders = Vec::new();
    for stream_id in 0..num_streams {
        let stream_tx = tx.clone();
        let chunks = generate_stream_chunks(stream_id, msgs_per_stream, payload_size);
        senders.push(tokio::spawn(async move {
            for chunk in chunks {
                let _ = stream_tx.send(chunk).await;
            }
        }));
    }
    drop(tx); // Close original sender so rx terminates when all spawned senders complete

    for s in senders {
        s.await.unwrap();
    }

    let mut latencies_us = receiver_handle.await.unwrap();
    let elapsed = start_time.elapsed();
    let elapsed_sec = elapsed.as_secs_f64();
    let throughput = (total_messages as f64) / elapsed_sec;

    latencies_us.sort_unstable();
    let p95_idx = (latencies_us.len() as f64 * 0.95) as usize;
    let p95_latency_ms = (latencies_us[p95_idx] as f64) / 1000.0;

    println!("=== S0.1 IPC Streaming Benchmark Results ===");
    println!("Streams: {}", num_streams);
    println!("Total Messages: {}", total_messages);
    println!("Payload Size: {} bytes", payload_size);
    println!("Elapsed Time: {:.3} s", elapsed_sec);
    println!("Throughput: {:.0} msgs/s (Target: >= 5,000 msgs/s)", throughput);
    println!("p95 Queue Latency: {:.3} ms (Target: <= 50 ms)", p95_latency_ms);

    assert_eq!(received_count.load(Ordering::Relaxed), total_messages);
    assert!(
        throughput >= 5000.0,
        "Throughput {:.0} msgs/s was below the >= 5,000 msgs/s target",
        throughput
    );
    assert!(
        p95_latency_ms <= 50.0,
        "p95 latency {:.3} ms exceeded the <= 50 ms target",
        p95_latency_ms
    );
}

#[test]
fn test_20k_line_diff_virtualization_dataset() {
    let t0 = Instant::now();
    let total_lines = 20_000;
    let hunks = generate_synthetic_diff(total_lines);
    let elapsed = t0.elapsed();

    let total_generated_lines: usize = hunks.iter().map(|h| h.lines.len()).sum();
    println!("=== S0.1 20k-Line Diff Generation Results ===");
    println!("Generated {} hunks ({} lines) in {:.2?}", hunks.len(), total_generated_lines, elapsed);

    assert_eq!(total_generated_lines, total_lines);
    assert!(elapsed.as_millis() < 50, "Diff hunk generation should be instantaneous (<50ms)");
}
