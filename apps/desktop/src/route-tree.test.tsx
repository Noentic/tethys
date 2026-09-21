import { afterEach, describe, expect, it, vi } from "vitest";

// The S0.1 benchmark harness is a spike, not a product surface: a production
// build must not be able to navigate to it.
// Importing main.tsx pulls in every view, so a cold import can exceed the
// default 5s when the whole monorepo's suites run in parallel.
const IMPORT_TIMEOUT_MS = 30_000;

async function loadRouter(dev: boolean) {
  vi.resetModules();
  vi.stubEnv("DEV", dev);
  const { router } = await import("./main");
  return router;
}

describe("route tree", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it(
    "has no /benchmark route in a production build",
    async () => {
      const router = await loadRouter(false);
      expect(Object.keys(router.routesByPath)).not.toContain("/benchmark");
    },
    IMPORT_TIMEOUT_MS,
  );

  it(
    "keeps /benchmark in development builds",
    async () => {
      const router = await loadRouter(true);
      expect(Object.keys(router.routesByPath)).toContain("/benchmark");
    },
    IMPORT_TIMEOUT_MS,
  );

  it(
    "always serves the product routes",
    async () => {
      const router = await loadRouter(false);
      const paths = Object.keys(router.routesByPath);
      for (const path of ["/workspaces", "/thread/new", "/thread/$id"]) {
        expect(paths).toContain(path);
      }
    },
    IMPORT_TIMEOUT_MS,
  );
});
