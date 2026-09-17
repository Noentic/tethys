import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import React from "react";
import ReactDOM from "react-dom/client";
import { BenchmarkView } from "./routes/benchmark";
import { App } from "./routes/index";

function RootLayout() {
  return (
    <div>
      <nav
        style={{
          display: "flex",
          gap: 16,
          padding: "12px 24px",
          borderBottom: "1px solid #eee",
          background: "#fdfdfd",
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        <Link to="/" activeProps={{ style: { fontWeight: "bold" } }}>
          Host Health (S0.0)
        </Link>
        <Link to="/benchmark" activeProps={{ style: { fontWeight: "bold" } }}>
          IPC & Diff Benchmark (S0.1)
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: App,
});

const benchmarkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/benchmark",
  component: BenchmarkView,
});

const routeTree = rootRoute.addChildren([indexRoute, benchmarkRoute]);
const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient();

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("missing #root element");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
