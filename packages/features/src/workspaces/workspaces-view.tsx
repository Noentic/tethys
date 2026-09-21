//! Workspace catalog shell (M1.16 U9). Composes the toolbar, the Needs-attention
//! filter, the card grid/list, the peek drawer, and the trust dialog. The
//! trust-filtered list comes from `workspace.list` (fixture default per D12);
//! approval content is worktree A's inbox through a fixture-backed hook.

import type { TrustGrant, Vcs, WorkspaceListItem } from "@tethys/bindings";
import { createClient } from "@tethys/client";
import {
  type CatalogViewState,
  type CatalogWorkspace,
  initialCatalogViewState,
  mapListItem,
  queryClient,
  queryKeys,
  selectCatalog,
  useWorkspaceFavorites,
  useWorkspaceRows,
  workspaceNeedsAttention,
} from "@tethys/state";
import {
  ApprovalInboxPill,
  Button,
  EmptyState,
  IconButton,
  Input,
  KeycapPill,
  SegmentedControl,
  Select,
} from "@tethys/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceCard } from "./workspace-card";
import { WorkspacePeekDrawer } from "./workspace-peek-drawer";
import { WorkspaceTrustDialog } from "./workspace-trust-dialog";

/** The narrow slice of the client the catalog needs. */
export interface WorkspaceCatalogClient {
  workspace: {
    list(): Promise<WorkspaceListItem[]>;
    add(request: TrustGrant): Promise<WorkspaceListItem>;
    remove(workspaceId: string): Promise<void>;
  };
}

const defaultClient = createClient();

const SearchIcon = () => (
  <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="none">
    <circle cx="7" cy="7" r="4.5" stroke="currentColor" />
    <path d="m10.5 10.5 3 3" stroke="currentColor" strokeLinecap="round" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="none">
    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeLinecap="round" />
  </svg>
);

const GridIcon = () => (
  <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none">
    <rect x="2" y="2" width="5" height="5" stroke="currentColor" />
    <rect x="9" y="2" width="5" height="5" stroke="currentColor" />
    <rect x="2" y="9" width="5" height="5" stroke="currentColor" />
    <rect x="9" y="9" width="5" height="5" stroke="currentColor" />
  </svg>
);

const ListIcon = () => (
  <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="none">
    <path
      d="M3 4h10M3 8h10M3 12h10"
      stroke="currentColor"
      strokeLinecap="round"
    />
  </svg>
);

/** Maps the wire card to the catalog view model (D12 real-source seam). */
export interface WorkspacesViewProps {
  workspaces?: CatalogWorkspace[];
  client?: WorkspaceCatalogClient;
  /** Opens the host folder picker; returns the chosen path or null. */
  pickFolder?: () => Promise<string | null>;
  /** Read-only VCS inspection of a picked path, for the dialog's copy. */
  inspectPath?: (path: string) => Promise<Vcs | null>;
  onNavigate?: (route: string) => void;
}

export function WorkspacesView({
  workspaces,
  client = defaultClient,
  pickFolder,
  inspectPath,
  onNavigate,
}: WorkspacesViewProps) {
  const rows = useWorkspaceRows(client, workspaces === undefined);
  const [pendingAdds, setPendingAdds] = useState<CatalogWorkspace[]>([]);
  const items = useMemo(() => {
    const added = new Set(pendingAdds.map((workspace) => workspace.id));
    return [
      ...pendingAdds,
      ...(workspaces ?? rows).filter((workspace) => !added.has(workspace.id)),
    ];
  }, [pendingAdds, rows, workspaces]);
  const [view, setView] = useState<CatalogViewState>(initialCatalogViewState);
  const [peekOpen, setPeekOpen] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [pendingVcs, setPendingVcs] = useState<Vcs | null>(null);

  const favorites = useWorkspaceFavorites();
  const visible = useMemo(
    () => selectCatalog(items, view, favorites),
    [items, view, favorites],
  );
  const attentionCount = items.filter(workspaceNeedsAttention).length;
  const selected = items.find((item) => item.id === view.selectedId) ?? null;
  const searchRef = useRef<HTMLInputElement>(null);

  // The search field's `/` keycap is a real shortcut (pen `Top bar / Search`).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const patch = (next: Partial<CatalogViewState>) =>
    setView((prev) => ({ ...prev, ...next }));

  const openWorkspace = (
    workspace: CatalogWorkspace,
    tab?: "sessions" | "approvals",
  ) => {
    patch({
      selectedId: workspace.id,
      peekTab:
        tab ?? (workspaceNeedsAttention(workspace) ? "approvals" : "sessions"),
    });
    setPeekOpen(true);
  };

  const startAdd = async () => {
    const path = pickFolder ? await pickFolder() : null;
    if (!path) return;
    let vcs: Vcs | null = null;
    try {
      vcs = inspectPath ? await inspectPath(path) : null;
    } catch {
      // A failed probe still opens the dialog with the no-VCS copy.
      vcs = null;
    }
    setPendingPath(path);
    setPendingVcs(vcs);
    setTrustOpen(true);
  };

  const confirmAdd = async (request: TrustGrant) => {
    const item = await client.workspace.add(request);
    const mapped = mapListItem(item);
    setPendingAdds((prev) => [
      mapped,
      ...prev.filter((workspace) => workspace.id !== mapped.id),
    ]);
    setTrustOpen(false);
    void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-(--tethys-canvas)">
      {/* Pen `ObHEA / D23gzb`: one 32px top bar, no second band. */}
      <section
        aria-label="Workspaces toolbar"
        className="flex h-8 shrink-0 items-center gap-md px-2xl pt-2xl"
      >
        <h1 className="shrink-0 text-heading-lg text-(--tethys-text-primary)">
          Workspaces
        </h1>
        <span
          className="shrink-0"
          title="Remote workspaces arrive with the SSH host, after Wave 2.5"
        >
          <SegmentedControl
            value="local"
            onChange={() => {}}
            options={[
              { value: "local", label: "Local" },
              { value: "remote", label: "Remote", disabled: true },
            ]}
          />
        </span>
        <div className="flex-1" />

        <div className="w-[220px] shrink-0">
          <Input
            ref={searchRef}
            type="text"
            aria-label="Search workspaces"
            placeholder="Search"
            value={view.search}
            onChange={(event) => patch({ search: event.target.value })}
            leadingIcon={<SearchIcon />}
            trailingIcon={<KeycapPill>/</KeycapPill>}
          />
        </div>

        <ApprovalInboxPill
          count={attentionCount}
          label="Needs attention"
          selected={view.needsAttentionOnly}
          onClick={() =>
            patch({ needsAttentionOnly: !view.needsAttentionOnly })
          }
        />

        <Select
          aria-label="Sort workspaces"
          value={view.sort}
          onChange={(event) =>
            patch({ sort: event.target.value as CatalogViewState["sort"] })
          }
          className="h-7 shrink-0 text-label-md"
        >
          <option value="recent">Recent activity</option>
          <option value="name">Alphabetical</option>
          <option value="sessions">Active sessions</option>
        </Select>

        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            size="default"
            label="Grid view"
            aria-pressed={view.viewMode === "grid"}
            onClick={() => patch({ viewMode: "grid" })}
            className={
              view.viewMode === "grid"
                ? "bg-(--tethys-surface-active) text-(--tethys-text-primary)"
                : "text-(--tethys-text-muted)"
            }
          >
            <GridIcon />
          </IconButton>
          <IconButton
            size="default"
            label="List view"
            aria-pressed={view.viewMode === "list"}
            onClick={() => patch({ viewMode: "list" })}
            className={
              view.viewMode === "list"
                ? "bg-(--tethys-surface-active) text-(--tethys-text-primary)"
                : "text-(--tethys-text-muted)"
            }
          >
            <ListIcon />
          </IconButton>
        </div>

        <Button
          variant="primary"
          className="shrink-0"
          onClick={() => void startAdd()}
        >
          <PlusIcon />
          <span>Add workspace</span>
        </Button>
      </section>

      <main
        aria-label="Workspace Catalog"
        className="flex-1 overflow-y-auto px-2xl pt-5 pb-2xl"
      >
        <h2 className="sr-only">Workspace List</h2>
        {visible.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title="No workspaces match the filter"
              description="Clear search or attention filters to view all trusted folders."
              action={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    patch({ search: "", needsAttentionOnly: false })
                  }
                >
                  Reset Filters
                </Button>
              }
            />
          </div>
        ) : (
          <div
            className={
              view.viewMode === "grid"
                ? "grid grid-cols-1 gap-lg sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                : "flex max-w-4xl flex-col gap-md"
            }
          >
            {visible.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                selected={workspace.id === view.selectedId && peekOpen}
                onOpen={() => openWorkspace(workspace)}
                onOpenThread={(sessionId) =>
                  onNavigate?.(`/thread/${sessionId}`)
                }
              />
            ))}
          </div>
        )}
      </main>

      <WorkspacePeekDrawer
        workspace={selected}
        open={peekOpen}
        initialTab={view.peekTab}
        onClose={() => {
          setPeekOpen(false);
          patch({ selectedId: null });
        }}
        onOpenThread={(sessionId) => onNavigate?.(`/thread/${sessionId}`)}
        onNewThread={() =>
          onNavigate?.(
            selected ? `/thread/new?workspace=${selected.id}` : "/thread/new",
          )
        }
      />

      <WorkspaceTrustDialog
        open={trustOpen}
        path={pendingPath}
        vcs={pendingVcs}
        onClose={() => setTrustOpen(false)}
        onConfirm={confirmAdd}
      />
    </div>
  );
}
