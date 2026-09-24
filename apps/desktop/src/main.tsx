import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@tethys/ui/tailwind.css";

import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import {
  hydrateSessionView,
  isSessionHydrated,
  queryClient,
} from "@tethys/state";
import React from "react";
import ReactDOM, { type Root } from "react-dom/client";
import { client } from "./client";
import { SettingsLayout } from "./routes/settings";
import { SettingsGeneralView } from "./routes/settings.general";
import { SettingsKeybindingsView } from "./routes/settings.keybindings";
import { SettingsMcpView } from "./routes/settings.mcp";
import { SettingsProvidersView } from "./routes/settings.providers";
import { SettingsSkillsView } from "./routes/settings.skills";
import { ThreadOpeningView, ThreadView } from "./routes/thread.$id";
import { ThreadNewView } from "./routes/thread.new";
import { WorkspacesView } from "./routes/workspaces";
import { AppShell } from "./shell/AppShell";

// Root Layout wrapping AppShell
function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <AppShell
      activeRoute={location.pathname}
      onNavigate={(to) => navigate({ to })}
    >
      <Outlet />
    </AppShell>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

// Index redirect -> /thread/new (Main Entry Point)
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Navigate to="/thread/new" replace />,
});

// Workspaces Hub
const workspacesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspaces",
  component: WorkspacesView,
});

// New Thread
const threadNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/thread/new",
  validateSearch: (
    search: Record<string, unknown>,
  ): { workspace?: string } => ({
    workspace:
      typeof search.workspace === "string" ? search.workspace : undefined,
  }),
  component: ThreadNewView,
});

// Thread by ID. The loader hydrates the shared session store (identity,
// history, config, capabilities) before the Inspector's first dependent
// render; the Inspector effect only subscribes when it is already hydrated.
// A revisited thread is already in the shared store, so it commits without a
// round trip. ACP bootstrap can take seconds, so the route renders
// `ThreadOpeningView` while the loader waits.
const threadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/thread/$id",
  pendingMs: 150,
  pendingComponent: ThreadOpeningView,
  loader: async ({ params }) => {
    if (isSessionHydrated(params.id)) {
      return null;
    }
    try {
      const view = await client.thread.get(params.id);
      hydrateSessionView(view);
    } catch {
      // The Inspector's subscription effect retries and surfaces the error.
    }
    return null;
  },
  component: () => {
    const params = useParams({ from: threadRoute.id });
    const navigate = useNavigate();
    return (
      <ThreadView
        sessionId={params.id}
        onNavigateThread={(id) =>
          void navigate({ to: "/thread/$id", params: { id } })
        }
      />
    );
  },
});

// Settings Layout
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: () => {
    const location = useLocation();
    const navigate = useNavigate();
    const activeSection =
      location.pathname.replace("/settings/", "") || "general";

    return (
      <SettingsLayout
        activeSection={activeSection}
        onNavigateSection={(path) => navigate({ to: path })}
      >
        <Outlet />
      </SettingsLayout>
    );
  },
});

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/",
  component: () => <Navigate to="/settings/general" replace />,
});

const settingsGeneralRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/general",
  component: SettingsGeneralView,
});

const settingsProvidersRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/providers",
  component: SettingsProvidersView,
});

const settingsMcpRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/mcp",
  component: SettingsMcpView,
});

const settingsSkillsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/skills",
  component: SettingsSkillsView,
});

const settingsKeybindingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/keybindings",
  component: SettingsKeybindingsView,
});

// S0.1 spike harness. Development builds only: it is not a product surface, so
// a production build neither registers the route nor loads its module.
const benchmarkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/benchmark",
  component: lazyRouteComponent(
    () => import("./routes/benchmark"),
    "BenchmarkView",
  ),
});
const devRoutes = import.meta.env.DEV ? [benchmarkRoute] : [];

const routeTree = rootRoute.addChildren([
  indexRoute,
  workspacesRoute,
  threadNewRoute,
  threadRoute,
  settingsRoute.addChildren([
    settingsIndexRoute,
    settingsGeneralRoute,
    settingsProvidersRoute,
    settingsMcpRoute,
    settingsSkillsRoute,
    settingsKeybindingsRoute,
  ]),
  ...devRoutes,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

type RootedContainer = HTMLElement & { __tethysRoot?: Root };

const rootElement = document.getElementById("root") as RootedContainer | null;
if (rootElement !== null) {
  // The dev entry is HMR self-accepting, so a re-executed module must reuse
  // the root: a second `createRoot` appends a second application to `#root`.
  let root = rootElement.__tethysRoot;
  if (root === undefined) {
    // A root left by a previous module execution has no marker: drop its DOM
    // so the repaired entry starts from one application.
    rootElement.replaceChildren();
    root = ReactDOM.createRoot(rootElement);
    rootElement.__tethysRoot = root;
  }
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
