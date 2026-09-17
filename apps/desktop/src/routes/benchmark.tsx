import { useStore } from "@tanstack/react-store";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Store } from "@tanstack/store";
import { createClient, type DiffHunk, type StreamChunk } from "@tethys/client";
import { useEffect, useRef, useState } from "react";

const client = createClient();

interface BenchState {
  chunksReceived: number;
  lastSeq: number;
  fps: number;
  p95PaintLatencyMs: number;
  throughputMsgsPerSec: number;
  isRunning: boolean;
  statusText: string;
}

const benchmarkStore = new Store<BenchState>({
  chunksReceived: 0,
  lastSeq: 0,
  fps: 60,
  p95PaintLatencyMs: 0,
  throughputMsgsPerSec: 0,
  isRunning: false,
  statusText: "Ready",
});

export function BenchmarkView() {
  const bench = useStore(benchmarkStore, (s) => s);
  const [_diffHunks, setDiffHunks] = useState<DiffHunk[]>([]);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [flatDiffLines, setFlatDiffLines] = useState<
    Array<{ lineNum: number; kind: string; text: string }>
  >([]);

  // FPS tracking
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());

  useEffect(() => {
    let animId: number;
    const loop = (now: number) => {
      frameCountRef.current++;
      if (now - lastFpsTimeRef.current >= 1000) {
        const measuredFps = Math.round(
          (frameCountRef.current * 1000) / (now - lastFpsTimeRef.current),
        );
        benchmarkStore.setState((prev) => ({ ...prev, fps: measuredFps }));
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;
      }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // 1. Run IPC 8-stream benchmark with rAF batching
  const runIpcBenchmark = async () => {
    benchmarkStore.setState((prev) => ({
      ...prev,
      isRunning: true,
      chunksReceived: 0,
      statusText: "Streaming 10,000 messages across 8 streams…",
    }));

    const totalMessages = 10000;
    const streams = 8;
    const latencies: number[] = [];
    let received = 0;
    let pendingBatch: StreamChunk[] = [];
    let rafScheduled = false;

    const startTime = performance.now();

    const flushBatch = () => {
      rafScheduled = false;
      const now = performance.now();
      for (const chunk of pendingBatch) {
        if (chunk.timestamp_ms) {
          latencies.push(now - chunk.timestamp_ms);
        }
      }
      received += pendingBatch.length;
      pendingBatch = [];

      benchmarkStore.setState((prev) => ({
        ...prev,
        chunksReceived: received,
      }));
    };

    try {
      await client.runStreamBenchmark(
        {
          streams,
          total_messages: totalMessages,
          message_size_bytes: 200,
        },
        (chunk: StreamChunk) => {
          pendingBatch.push(chunk);
          if (!rafScheduled) {
            rafScheduled = true;
            requestAnimationFrame(flushBatch);
          }
        },
      );

      // Final flush
      if (pendingBatch.length > 0) {
        flushBatch();
      }

      const totalElapsedSec = (performance.now() - startTime) / 1000;
      const throughput = Math.round(totalMessages / totalElapsedSec);

      latencies.sort((a, b) => a - b);
      const p95Idx = Math.floor(latencies.length * 0.95);
      const p95 = latencies[p95Idx] ?? 0;

      benchmarkStore.setState((prev) => ({
        ...prev,
        isRunning: false,
        throughputMsgsPerSec: throughput,
        p95PaintLatencyMs: Number(p95.toFixed(2)),
        statusText: `Complete! ${throughput.toLocaleString()} msgs/s, p95 paint: ${p95.toFixed(1)}ms`,
      }));
    } catch (err) {
      benchmarkStore.setState((prev) => ({
        ...prev,
        isRunning: false,
        statusText: `Error running benchmark: ${String(err)}`,
      }));
    }
  };

  // 2. Load 20,000-line virtualized diff
  const loadSyntheticDiff = async () => {
    setLoadingDiff(true);
    try {
      const hunks = await client.getSyntheticDiff(20000);
      setDiffHunks(hunks);
      const flat: Array<{ lineNum: number; kind: string; text: string }> = [];
      let lineCounter = 1;
      for (const h of hunks) {
        for (const l of h.lines) {
          flat.push({ lineNum: lineCounter++, kind: l.kind, text: l.text });
        }
      }
      setFlatDiffLines(flat);
    } catch (err) {
      console.error("Failed to load synthetic diff:", err);
    } finally {
      setLoadingDiff(false);
    }
  };

  // Virtualizer for diff lines
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: flatDiffLines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 10,
  });

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>S0.1 IPC & Rendering Spike Test Harness</h1>
      <p style={{ color: "#666" }}>
        Exit Criteria: &ge; 5,000 small msgs/s at 60 fps, &le; 50 ms p95
        byte-to-paint latency, and smooth 20k-line diff virtualization (AD-10).
      </p>

      {/* IPC Benchmark Section */}
      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <h2>8-Stream IPC Benchmark (Channels vs Store Reducer)</h2>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <button
            type="button"
            onClick={runIpcBenchmark}
            disabled={bench.isRunning}
            style={{
              padding: "8px 16px",
              background: bench.isRunning ? "#aaa" : "#0066cc",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: bench.isRunning ? "not-allowed" : "pointer",
            }}
          >
            {bench.isRunning ? "Running…" : "Start 10,000 Message Benchmark"}
          </button>
          <span>{bench.statusText}</span>
        </div>

        <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
          <div>
            <strong>Throughput:</strong>{" "}
            <span
              style={{
                color: bench.throughputMsgsPerSec >= 5000 ? "green" : "black",
              }}
            >
              {bench.throughputMsgsPerSec.toLocaleString()} msgs/s
            </span>{" "}
            (Target: &ge; 5,000)
          </div>
          <div>
            <strong>FPS:</strong>{" "}
            <span style={{ color: bench.fps >= 55 ? "green" : "orange" }}>
              {bench.fps} fps
            </span>{" "}
            (Target: 60)
          </div>
          <div>
            <strong>p95 Byte-to-Paint:</strong>{" "}
            <span
              style={{
                color: bench.p95PaintLatencyMs <= 50 ? "green" : "red",
              }}
            >
              {bench.p95PaintLatencyMs} ms
            </span>{" "}
            (Target: &le; 50 ms)
          </div>
          <div>
            <strong>Messages Received:</strong>{" "}
            {bench.chunksReceived.toLocaleString()} / 10,000
          </div>
        </div>
      </section>

      {/* Virtualized Diff Section (AD-10) */}
      <section
        style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}
      >
        <h2>20,000-Line Virtualized Diff Renderer (AD-10)</h2>
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={loadSyntheticDiff}
            disabled={loadingDiff}
            style={{
              padding: "6px 14px",
              background: "#2e7d32",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {loadingDiff
              ? "Generating…"
              : `Load 20,000-Line Diff (${flatDiffLines.length} loaded)`}
          </button>
          <span style={{ marginLeft: 16, color: "#555" }}>
            Virtualized rendering: only DOM nodes currently in viewport are
            mounted (~30 nodes).
          </span>
        </div>

        {flatDiffLines.length > 0 && (
          <div
            ref={parentRef}
            style={{
              height: 400,
              overflow: "auto",
              border: "1px solid #ccc",
              fontFamily: "monospace",
              fontSize: 13,
              background: "#fafafa",
            }}
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const line = flatDiffLines[virtualRow.index];
                const bg =
                  line.kind === "Addition"
                    ? "#e6ffec"
                    : line.kind === "Deletion"
                      ? "#ffebe9"
                      : "transparent";
                return (
                  <div
                    key={virtualRow.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                      backgroundColor: bg,
                      display: "flex",
                      alignItems: "center",
                      paddingLeft: 8,
                      borderBottom: "1px solid #f0f0f0",
                    }}
                  >
                    <span
                      style={{
                        width: 60,
                        color: "#999",
                        userSelect: "none",
                      }}
                    >
                      {line.lineNum}
                    </span>
                    <span>{line.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
