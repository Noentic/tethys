import { defineConfig } from "vitest/config";

// Recorded-benchmark config (M1.9 U5). Deliberately separate from
// `vitest.config.ts` so `pnpm test` / turbo `test` never runs the 20k-line
// generation (AGENTS.md heavy-benchmark anti-pattern).
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["bench/**/*.bench.tsx"],
    testTimeout: 60_000,
  },
});
