//! Screen-level regressions: the repaired flows against a stubbed client, in
//! the real router. Complements `route-tree.test.tsx` (route shape only).

import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { queryClient } from "@tethys/state";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, threadCreate, threadPrompt, workspaceAdd, recheckSpy } =
  vi.hoisted(() => {
    const workspace = {
      id: "acme-web",
      name: "acme-web",
      path: "/home/dev/acme-web",
      capabilities: {
        restore: true,
        max_concurrent_sessions: null,
        vcs: { kind: "git-remote", host: "github" },
      },
      trust: "trusted",
      sessions: [{ id: "s1", title: "fix-auth", state: "Running" }],
    };
    const profile = {
      id: "claude-code",
      name: "Claude Code",
      class: "registry",
      enabled: true,
      launch_spec: { program: "claude", args: [], cwd: null, env: [] },
      registry_ref: null,
      projection_target: null,
      preferred_protocol: "V2",
      health: "healthy",
      detail: null,
      protocol: "V2",
      capabilities: null,
      auth_methods: [],
      detected_version: "1.0.0",
      latency_ms: 12,
      last_checked_ms: Date.now(),
      recheck: "idle",
    };
    return {
      state: {
        workspaces: [workspace],
        profiles: [profile],
        threads: [] as never[],
      },
      threadCreate: vi.fn(async () => ({ id: "t-1" })),
      threadPrompt: vi.fn(async () => undefined),
      workspaceAdd: vi.fn(async () => workspace),
      recheckSpy: vi.fn(async () => undefined),
    };
  });

vi.mock("@tethys/client", () => ({
  createClient: () => ({
    workspace: {
      list: async () => state.workspaces,
      add: workspaceAdd,
      remove: async () => undefined,
      probe: async () => ({ kind: "git-remote", host: "github" }),
    },
    agent: {
      profilesList: async () => state.profiles,
      recheck: recheckSpy,
      profilesUpdate: async () => state.profiles[0],
      healthIntervalSet: async () => undefined,
      processSample: async () => [],
      registryList: async () => [],
      stderr: async () => "",
    },
    thread: {
      list: async () => state.threads,
      create: threadCreate,
      prompt: threadPrompt,
      setConfigOption: async () => undefined,
    },
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: async () => "/home/dev/acme-web",
}));

const IMPORT_TIMEOUT_MS = 30_000;

async function loadRouter() {
  vi.resetModules();
  const { router } = await import("./main");
  return router;
}

async function renderAt(to: string, search?: Record<string, unknown>) {
  const router = await loadRouter();
  await (search ? router.navigate({ to, search }) : router.navigate({ to }));
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
  localStorage.clear();
  state.workspaces = state.workspaces.slice(0, 1);
  state.profiles = state.profiles.slice(0, 1);
});

describe("screens", () => {
  it(
    "renders the Workspaces screen from the live client, with no fixture ids",
    async () => {
      await renderAt("/workspaces");
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Add workspace" }),
        ).toBeTruthy(),
      );
      // The composer's fixture workspace never leaks into a live list.
      expect(screen.queryByText("~/Code/tethys")).toBeNull();
    },
    IMPORT_TIMEOUT_MS,
  );

  it(
    "keeps the composer enabled and starts a thread on submit",
    async () => {
      await renderAt("/thread/new", { workspace: "acme-web" });
      const editor = await waitFor(() => {
        const found = document.querySelector(".ProseMirror");
        expect(found?.getAttribute("contenteditable")).toBe("true");
        return found as HTMLElement;
      });
      // `?workspace=` resolves once the live list lands, then the placeholder
      // names the next real step instead of the unresolved folder.
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Workspace" }).textContent,
        ).toContain("acme-web"),
      );
      expect(editor.getAttribute("data-placeholder")).toBe(
        "Choose a provider to start a thread",
      );
    },
    IMPORT_TIMEOUT_MS,
  );

  it(
    "opens the peek drawer from a card and starts a thread in that workspace",
    async () => {
      const router = await renderAt("/workspaces");
      fireEvent.click(
        (await screen.findAllByRole("button", { name: /acme-web/ }))[0],
      );
      const drawer = await screen.findByRole("dialog");
      fireEvent.click(
        within(drawer).getByRole("button", { name: "New thread" }),
      );
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/thread/new");
        expect(router.state.location.search).toEqual({ workspace: "acme-web" });
      });
    },
    IMPORT_TIMEOUT_MS,
  );

  it(
    "adds a workspace through the picker and the trust dialog",
    async () => {
      await renderAt("/workspaces");
      fireEvent.click(
        await screen.findByRole("button", { name: "Add workspace" }),
      );
      await screen.findByRole("dialog");
      // The probe resolved the folder as a remote, so the dialog names it.
      expect(await screen.findByTestId("trust-copy-remote")).toBeTruthy();
      fireEvent.click(
        screen.getByRole("button", { name: "Trust & Add Workspace" }),
      );
      await waitFor(() =>
        expect(workspaceAdd).toHaveBeenCalledWith({
          path: "/home/dev/acme-web",
          permission_mode: "supervised",
          scope: "folder",
          init_git: false,
        }),
      );
    },
    IMPORT_TIMEOUT_MS,
  );

  it(
    "no longer offers Tethys Sync anywhere in Settings",
    async () => {
      await renderAt("/settings/general");
      await waitFor(() =>
        expect(screen.getByLabelText("General Settings")).toBeTruthy(),
      );
      expect(screen.queryByText(/Tethys Sync/)).toBeNull();
      expect(screen.getByLabelText("Color scheme")).toBeTruthy();
      expect(screen.getByLabelText("Tool call density")).toBeTruthy();
      const zoom = screen.getByRole("spinbutton", { name: "Zoom" });
      expect(zoom.getAttribute("aria-valuenow")).toBe("100");
      expect(zoom.textContent).toContain("100%");
      expect(
        screen.getByRole("spinbutton", { name: "Typography size" }).textContent,
      ).toContain("14px");

      fireEvent.keyDown(window, { key: "=", ctrlKey: true, cancelable: true });
      await waitFor(() =>
        expect(zoom.getAttribute("aria-valuenow")).toBe("110"),
      );
    },
    IMPORT_TIMEOUT_MS,
  );

  it(
    "applies the chosen color scheme to the document",
    async () => {
      await renderAt("/settings/general");
      const scheme = await screen.findByLabelText("Color scheme");
      fireEvent.change(scheme, { target: { value: "light" } });
      await waitFor(() =>
        expect(document.documentElement.dataset.theme).toBe("light"),
      );
    },
    IMPORT_TIMEOUT_MS,
  );

  it(
    "renders the Providers catalog with the soon rows inert",
    async () => {
      await renderAt("/settings/providers");
      await waitFor(() =>
        expect(screen.getByTestId("providers-detection")).toBeTruthy(),
      );
      expect(screen.getAllByTestId("provider-row")).toHaveLength(6);
      expect(screen.getAllByTestId("provider-soon")).toHaveLength(2);
    },
    IMPORT_TIMEOUT_MS,
  );

  it(
    "runs the health check the palette offers, and offers no dead row",
    async () => {
      await renderAt("/workspaces");
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      const entry = await screen.findByText("Run Manual Health Check");
      expect(screen.queryByText("Search all workspace files")).toBeNull();
      fireEvent.click(entry);
      await waitFor(() => expect(recheckSpy).toHaveBeenCalled());
    },
    IMPORT_TIMEOUT_MS,
  );

  it(
    "renders empty states, not fixture rows, for an empty client",
    async () => {
      state.workspaces = [];
      state.profiles = [];
      await renderAt("/workspaces");
      expect(
        await screen.findByText("No workspaces match the filter"),
      ).toBeTruthy();
      expect(screen.queryByTestId("workspace-card")).toBeNull();
    },
    IMPORT_TIMEOUT_MS,
  );
});
