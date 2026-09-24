//! Workspace catalog shell (M1.16 U9). Composes the toolbar, the Needs-attention
//! filter, the card grid/list, the peek drawer, and the trust dialog. The
//! trust-filtered list comes from `workspace.list` (fixture default per D12);
//! approval content is worktree A's inbox through a fixture-backed hook.

import type {
  AgentProfileView,
  ProviderSessionPage,
  ThreadSummary,
  TrustGrant,
  Vcs,
  WorkspaceListItem,
} from "@tethys/bindings";
import { createClient } from "@tethys/client";
import {
  type CatalogViewState,
  type CatalogWorkspace,
  initialCatalogViewState,
  mapListItem,
  queryClient,
  queryKeys,
  selectCatalog,
  useProvidersQuery,
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
import {
  type ProviderSessionBrowserState,
  WorkspacePeekDrawer,
} from "./workspace-peek-drawer";
import { WorkspaceTrustDialog } from "./workspace-trust-dialog";

/** The narrow slice of the client the catalog needs. */
export interface WorkspaceCatalogClient {
  workspace: {
    list(): Promise<WorkspaceListItem[]>;
    add(request: TrustGrant): Promise<WorkspaceListItem>;
    remove(workspaceId: string): Promise<void>;
  };
  agent: {
    profilesList(): Promise<AgentProfileView[]>;
  };
  thread: {
    listProviderSessions(
      profileId: string,
      workspaceId: string,
      cursor?: string,
    ): Promise<ProviderSessionPage>;
    importSessions(
      profileId: string,
      workspaceId: string,
    ): Promise<ThreadSummary[]>;
    archive(id: string): Promise<void>;
    delete(id: string): Promise<void>;
    deleteProviderSession(id: string): Promise<void>;
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
  const providers = useProvidersQuery(client);
  const [pendingAdds, setPendingAdds] = useState<CatalogWorkspace[]>([]);
  const profilesById = useMemo(
    () =>
      new Map((providers.data ?? []).map((profile) => [profile.id, profile])),
    [providers.data],
  );
  const items = useMemo(() => {
    const added = new Set(pendingAdds.map((workspace) => workspace.id));
    const merged = [
      ...pendingAdds,
      ...(workspaces ?? rows).filter((workspace) => !added.has(workspace.id)),
    ];
    return merged.map((workspace) => ({
      ...workspace,
      sessions: workspace.sessions.map((session) => {
        const profile = session.profileId
          ? profilesById.get(session.profileId)
          : undefined;
        return profile
          ? {
              ...session,
              providerId: profile.registry_ref?.id ?? profile.id,
              providerName: profile.name,
              canDeleteProviderSession:
                profile.capabilities?.delete_session === true,
            }
          : session;
      }),
    }));
  }, [pendingAdds, rows, workspaces, profilesById]);
  const [view, setView] = useState<CatalogViewState>(initialCatalogViewState);
  const [peekOpen, setPeekOpen] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [pendingVcs, setPendingVcs] = useState<Vcs | null>(null);
  const [importingProfileId, setImportingProfileId] = useState<string | null>(
    null,
  );
  const [importError, setImportError] = useState<string | null>(null);
  const [providerSessions, setProviderSessions] = useState<
    (ProviderSessionBrowserState & { key: string }) | null
  >(null);
  const [pendingSessionAction, setPendingSessionAction] = useState<
    string | null
  >(null);
  const [sessionActionError, setSessionActionError] = useState<string | null>(
    null,
  );

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
    setProviderSessions(null);
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

  const importSessions = async (profileId: string) => {
    if (!selected) return;
    setImportingProfileId(profileId);
    setImportError(null);
    try {
      await client.thread.importSessions(profileId, selected.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces }),
      ]);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setImportingProfileId(null);
    }
  };

  const browseProviderSessions = async (profileId: string, cursor?: string) => {
    if (!selected) return;
    const key = `${selected.id}\u0000${profileId}`;
    setProviderSessions((current) => ({
      key,
      profileId,
      sessions:
        cursor !== undefined && current?.key === key ? current.sessions : [],
      nextCursor: current?.key === key ? current.nextCursor : null,
      loading: true,
      loaded: cursor !== undefined && current?.key === key && current.loaded,
      error: null,
      failedCursor: null,
    }));
    try {
      const page = await client.thread.listProviderSessions(
        profileId,
        selected.id,
        cursor,
      );
      setProviderSessions((current) =>
        current?.key === key
          ? {
              ...current,
              sessions:
                cursor === undefined
                  ? page.sessions
                  : [...current.sessions, ...page.sessions],
              nextCursor: page.next_cursor,
              loading: false,
              loaded: true,
            }
          : current,
      );
    } catch (error) {
      setProviderSessions((current) =>
        current?.key === key
          ? {
              ...current,
              loading: false,
              error: error instanceof Error ? error.message : String(error),
              failedCursor: cursor ?? null,
            }
          : current,
      );
    }
  };

  const runSessionAction = async (
    sessionId: string,
    action: () => Promise<void>,
  ) => {
    setPendingSessionAction(sessionId);
    setSessionActionError(null);
    try {
      await action();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.threads }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces }),
      ]);
    } catch (error) {
      setSessionActionError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setPendingSessionAction(null);
    }
  };

  const archiveSession = (sessionId: string) =>
    runSessionAction(sessionId, () => client.thread.archive(sessionId));

  const deleteLocalSession = (sessionId: string) => {
    if (
      !window.confirm(
        "Delete this local thread and transcript? The ACP session will be closed or cancelled when supported.",
      )
    ) {
      return;
    }
    return runSessionAction(sessionId, () => client.thread.delete(sessionId));
  };

  const deleteProviderSession = (
    session: CatalogWorkspace["sessions"][number],
  ) => {
    const provider = session.providerName ?? session.providerId;
    if (
      !window.confirm(
        `Delete this session from ${provider}? The local transcript will remain.`,
      )
    ) {
      return;
    }
    return runSessionAction(session.id, () =>
      client.thread.deleteProviderSession(session.id),
    );
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-(--tethys-canvas)">
      {/* Pen `ObHEA / D23gzb`: one 32px top bar, no second band. */}
      <section
        aria-label="Workspaces toolbar"
        className="flex shrink-0 items-center gap-md px-2xl pt-2xl"
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
        className="flex-1 overflow-y-auto px-2xl pt-2xl pb-2xl"
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
        importableProviders={(providers.data ?? []).filter(
          (provider) =>
            provider.enabled &&
            provider.health === "healthy" &&
            provider.capabilities?.list_sessions === true,
        )}
        importingProfileId={importingProfileId}
        importError={importError}
        providerSessions={providerSessions}
        pendingSessionAction={pendingSessionAction}
        sessionActionError={sessionActionError}
        onImportSessions={importSessions}
        onBrowseProviderSessions={browseProviderSessions}
        onArchiveSession={archiveSession}
        onDeleteLocalSession={deleteLocalSession}
        onDeleteProviderSession={deleteProviderSession}
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
