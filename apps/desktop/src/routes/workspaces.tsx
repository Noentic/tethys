import { useNavigate } from "@tanstack/react-router";
import type { Vcs } from "@tethys/bindings";
import { createClient } from "@tethys/client";
import { WorkspacesView as FeatureWorkspacesView } from "@tethys/features";

const client = createClient();

/** Native folder picker; `null` when the user cancels. */
async function pickFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

/** Read-only VCS probe for the trust dialog's copy; never blocks the dialog. */
async function inspectPath(path: string): Promise<Vcs | null> {
  try {
    return await client.workspace.probe(path);
  } catch {
    return null;
  }
}

/**
 * Thin mount (milestone §1.2). The catalog, trust dialog, peek drawer, and
 * their state live in `@tethys/features`; this route owns only the translation
 * from the feature's route strings to typed router navigation, plus the two
 * host effects (folder picker, VCS probe).
 */
export function WorkspacesView() {
  const navigate = useNavigate();

  return (
    <FeatureWorkspacesView
      client={client}
      pickFolder={pickFolder}
      inspectPath={inspectPath}
      onNavigate={(route) => {
        if (route.startsWith("/thread/new")) {
          const query = route.includes("?") ? route.split("?")[1] : "";
          const workspace =
            new URLSearchParams(query).get("workspace") ?? undefined;
          void navigate({ to: "/thread/new", search: { workspace } });
          return;
        }
        if (route.startsWith("/thread/")) {
          const id = route.slice("/thread/".length);
          void navigate({ to: "/thread/$id", params: { id } });
          return;
        }
        void navigate({ to: "/workspaces" });
      }}
    />
  );
}
