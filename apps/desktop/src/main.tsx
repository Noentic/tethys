import "@tethys/ui/src/tokens/tokens.css";
import "@tethys/ui/tailwind.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { BenchmarkView } from "./routes/benchmark";
import { SettingsLayout } from "./routes/settings";
import { SettingsGeneralView } from "./routes/settings.general";
import { SettingsKeybindingsView } from "./routes/settings.keybindings";
import { SettingsMcpView } from "./routes/settings.mcp";
import { SettingsProvidersView } from "./routes/settings.providers";
import { SettingsSkillsView } from "./routes/settings.skills";
import { ThreadView } from "./routes/thread.$id";
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

// Index redirect -> /workspaces
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Navigate to="/workspaces" replace />,
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
  component: () => {
    const navigate = useNavigate();
    return (
      <ThreadNewView
        onStartSession={(_wsId, _modelId) => {
          const generatedId = `sess-${Date.now().toString(36)}`;
          navigate({ to: `/thread/${generatedId}` });
        }}
      />
    );
  },
});

// Thread by ID
const threadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/thread/$id",
  component: () => {
    const params = useParams({ from: threadRoute.id });
    return <ThreadView sessionId={params.id} />;
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

// S0.1 Dev-only Benchmark Route
const benchmarkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/benchmark",
  component: BenchmarkView,
});

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
  benchmarkRoute,
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

const queryClient = new QueryClient();

const rootElement = document.getElementById("root");
if (rootElement !== null) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
