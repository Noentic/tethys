import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { ThreadNewScreen } from "@tethys/features";

const routeApi = getRouteApi("/thread/new");

/**
 * Thin route mount (D13): `/thread/new` renders the `@tethys/features`
 * screen and nothing else. The screen owns the Provider/workspace pickers,
 * the composer and the `session/new` composition (including navigation to the
 * real created thread id).
 */
export function ThreadNewView() {
  const navigate = useNavigate();
  const { workspace } = routeApi.useSearch();
  return (
    <ThreadNewScreen
      navigate={(to) => navigate({ to })}
      initialWorkspaceId={workspace}
    />
  );
}
