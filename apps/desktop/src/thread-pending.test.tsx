//! Route-level pending behaviour for `/thread/$id`: a slow ACP bootstrap shows
//! the opening surface instead of leaving the previous route on screen, and a
//! revisited hydrated thread commits without a `thread.get` round trip.

import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import type { ThreadSessionView } from "@tethys/bindings";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSpy, pending } = vi.hoisted(() => ({
  pending: { resolve: null as ((view: unknown) => void) | null },
  getSpy: vi.fn(
    () =>
      new Promise((resolve) => {
        pending.resolve = resolve;
      }),
  ),
}));

const view: ThreadSessionView = {
  thread: {
    id: "t-pending",
    workspace_id: "w-1",
    agent_profile_id: "p-1",
    title: "Slow thread",
    workdir: "~/Code/tethys",
    state: "Idle",
    session_id: "acp-1",
  },
  events: [],
  config_options: [],
  capabilities: null,
  permission_mode: "supervised",
  latest_seq: 0,
};

vi.mock("@tethys/client", () => ({
  createClient: () => ({
    workspace: { list: async () => [] },
    agent: { profilesList: async () => [] },
    thread: { list: async () => [], get: getSpy },
    events: { subscribe: vi.fn().mockResolvedValue(undefined) },
    permission: {
      respond: vi.fn().mockResolvedValue(undefined),
      elicitationRespond: vi.fn().mockResolvedValue(undefined),
    },
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: async () => null,
}));

const IMPORT_TIMEOUT_MS = 30_000;

/** A fresh route tree plus the state module instance it actually uses. */
async function loadHarness() {
  vi.resetModules();
  const state = await import("@tethys/state");
  state.clearAllSessionStoresForTesting();
  state.clearAllSessionStreamsForTesting();
  const { router } = await import("./main");
  return { router, state };
}

function renderRouter(
  router: Awaited<ReturnType<typeof loadHarness>>["router"],
  queryClient: import("@tanstack/react-query").QueryClient,
) {
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getSpy.mockClear();
  pending.resolve = null;
});

describe("thread route pending state", () => {
  it(
    "shows the opening surface while the loader waits, then the Inspector",
    async () => {
      const { router, state } = await loadHarness();
      await router.navigate({ to: "/workspaces" });
      renderRouter(router, state.queryClient);

      void router.navigate({
        to: "/thread/$id",
        params: { id: view.thread.id },
      });

      await waitFor(() =>
        expect(screen.getByTestId("thread-opening")).toBeTruthy(),
      );
      expect(screen.queryByTestId("inspector-screen")).toBeNull();

      pending.resolve?.(view);
      await waitFor(() =>
        expect(screen.getByTestId("inspector-screen")).toBeTruthy(),
      );
      expect(screen.queryByTestId("thread-opening")).toBeNull();
    },
    IMPORT_TIMEOUT_MS,
  );

  it(
    "skips thread.get when the session store is already hydrated",
    async () => {
      const { router, state } = await loadHarness();
      state.hydrateSessionView(view);
      await router.navigate({
        to: "/thread/$id",
        params: { id: view.thread.id },
      });
      renderRouter(router, state.queryClient);

      expect(getSpy).not.toHaveBeenCalled();
      expect(await screen.findByTestId("inspector-screen")).toBeTruthy();
    },
    IMPORT_TIMEOUT_MS,
  );
});
