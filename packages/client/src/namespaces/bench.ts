//! Benchmark helpers (non-§12.1). The `Channel`-based stream benchmark lives
//! here so the transport import is isolated to one module.

import { Channel } from "@tauri-apps/api/core";
import type {
  BenchmarkConfig,
  BenchmarkResult,
  DiffHunk,
  StreamChunk,
} from "@tethys/bindings";

import type { Call } from "../transport";

export function benchFlatHelpers(call: Call) {
  return {
    /** `git.diff.synthetic` — S0.1 diff benchmark generator */
    getSyntheticDiff: (lineCount = 20000) =>
      call<DiffHunk[]>("generate_synthetic_diff", { lineCount }),
    /** `bench.stream` — S0.1 IPC channel streaming */
    runStreamBenchmark: async (
      config: BenchmarkConfig,
      onChunk: (chunk: StreamChunk) => void,
    ): Promise<BenchmarkResult> => {
      const channel = new Channel<StreamChunk>();
      channel.onmessage = onChunk;
      return call<BenchmarkResult>("run_stream_benchmark", {
        config,
        onChunk: channel,
      });
    },
  };
}
