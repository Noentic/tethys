import { useNavigate } from "@tanstack/react-router";
import { ThreadNewScreen } from "@tethys/features";

/**
 * Thin route mount (D13): `/thread/new` renders the `@tethys/features`
 * screen and nothing else. The screen owns the Provider/workspace pickers,
 * the composer and the `session/new` composition (including navigation to the
 * real created thread id).
 */
export function ThreadNewView() {
  const navigate = useNavigate();
  return <ThreadNewScreen navigate={(to) => navigate({ to })} />;
}
