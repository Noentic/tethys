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
  selectCatalog,
  useWorkspaceList,
  workspaceNeedsAttention,
} from "@tethys/state";
import {
  ApprovalInboxPill,
  Button,
  EmptyState,
  IconButton,
  Input,
  SegmentedControl,
  Select,
} from "@tethys/ui";
import { useMemo, useState } from "react";
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
export function mapListItem(item: WorkspaceListItem): CatalogWorkspace {
  return {
    id: item.id,
    name: item.name,
    path: item.path,
    capabilities: item.capabilities,
    trust: item.trust,
    permissionMode: "supervised",
    sessions: item.sessions.map((session) => ({
      id: session.id,
      providerId: "unknown",
      branchName: session.title,
      status: session.state,
      turnCount: 0,
      diffStat: null,
    })),
  };
}

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
  const fixtures = useWorkspaceList(workspaces);
  const [items, setItems] = useState<CatalogWorkspace[]>(fixtures);
  const [view, setView] = useState<CatalogViewState>(initialCatalogViewState);
  const [peekOpen, setPeekOpen] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [pendingVcs, setPendingVcs] = useState<Vcs | null>(null);

  const visible = useMemo(() => selectCatalog(items, view), [items, view]);
  const attentionCount = items.filter(workspaceNeedsAttention).length;
  const selected = items.find((item) => item.id === view.selectedId) ?? null;

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
    setPendingPath(path);
    setPendingVcs(inspectPath ? await inspectPath(path) : null);
    setTrustOpen(true);
  };

  const confirmAdd = async (request: TrustGrant) => {
    const item = await client.workspace.add(request);
    const mapped = mapListItem(item);
    setItems((prev) => [...prev.filter((w) => w.id !== mapped.id), mapped]);
    setTrustOpen(false);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-(--tethys-canvas)">
      <section
        aria-label="Workspaces toolbar"
        className="flex h-16 shrink-0 items-center justify-between gap-lg border-b border-(--tethys-hairline) px-2xl"
      >
        <div className="flex items-center gap-lg">
          <h1 className="text-heading-lg text-(--tethys-text-primary)">
            Workspaces
          </h1>
          <SegmentedControl
            value={view.needsAttentionOnly ? "attention" : "all"}
            onChange={(value) =>
              patch({ needsAttentionOnly: value === "attention" })
            }
            options={[
              { value: "all", label: "All" },
              { value: "attention", label: "Attention" },
            ]}
          />
        </div>

        <div className="flex items-center gap-md">
          <div className="w-64">
            <Input
              type="text"
              aria-label="Search workspaces"
              placeholder="Search workspaces..."
              value={view.search}
              onChange={(event) => patch({ search: event.target.value })}
              leadingIcon={<SearchIcon />}
            />
          </div>

          <ApprovalInboxPill
            count={attentionCount}
            selected={view.needsAttentionOnly}
            onClick={() =>
              patch({ needsAttentionOnly: !view.needsAttentionOnly })
            }
          />

          <Button variant="primary" onClick={() => void startAdd()}>
            <PlusIcon />
            <span>New Workspace</span>
          </Button>
        </div>
      </section>

      <div className="flex h-11 shrink-0 items-center justify-between border-b border-(--tethys-hairline) px-2xl text-label-md font-normal text-(--tethys-text-muted)">
        <div className="flex items-center gap-lg">
          <span className="text-label-md text-(--tethys-text-secondary)">
            {visible.length} Workspaces
          </span>
          <div className="flex items-center gap-sm">
            <span>Sort</span>
            <Select
              aria-label="Sort workspaces"
              value={view.sort}
              onChange={(event) =>
                patch({ sort: event.target.value as CatalogViewState["sort"] })
              }
              className="h-7 text-label-md"
            >
              <option value="recent">Recent Activity</option>
              <option value="name">Alphabetical</option>
              <option value="sessions">Active Sessions</option>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <IconButton
            size="compact"
            label="Grid view"
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
            size="compact"
            label="List view"
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
      </div>

      <main
        aria-label="Workspace Catalog"
        className="flex-1 overflow-y-auto p-2xl"
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
                ? "grid grid-cols-1 gap-lg md:grid-cols-2 lg:grid-cols-3"
                : "flex max-w-4xl flex-col gap-md"
            }
          >
            {visible.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                selected={workspace.id === view.selectedId && peekOpen}
                onOpen={() => openWorkspace(workspace)}
                onNewThread={() => onNavigate?.("/thread/new")}
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
        onNewThread={() => onNavigate?.("/thread/new")}
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
