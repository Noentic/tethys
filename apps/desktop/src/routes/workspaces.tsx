import {
  GitBranch,
  GridSquare,
  ListUnordered,
  MagnifyingGlass,
  Plus,
  Shield,
  Star,
  TerminalWindow,
  Warning,
} from "@nebutra/icons";
import {
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  IconButton,
  Input,
  KeycapPill,
  ModalDialog,
  SegmentedControl,
  Select,
  StatusDot,
  UnderlineTabs,
} from "@tethys/ui";
import type React from "react";
import { useState } from "react";

export interface WorkspaceSession {
  id: string;
  branch: string;
  diffStat: string;
  turn: string;
  provider: "Claude Code" | "Codex" | "OpenCode" | "Gemini CLI";
  status: "running" | "waiting_approval" | "idle" | "error";
}

// workspace-source-badge values (DESIGN.md). The GitHub/GitLab entries name the host of
// an existing folder's git remote, as read-only status. They are never an entry point for
// adding a workspace. See pages-views-spec.md §0.1.
export type WorkspaceSourceKind =
  | "Git · GitHub"
  | "Git · GitLab"
  | "Git · local"
  | "Folder · no VCS";

export interface WorkspaceItem {
  id: string;
  name: string;
  path: string;
  sourceKind: WorkspaceSourceKind;
  isRemote?: boolean;
  needsAttention?: boolean;
  branch?: string;
  statusSummary: string;
  sessions: WorkspaceSession[];
  starred?: boolean;
  permissionMode?: "Supervised" | "Auto-edit" | "YOLO";
}

const DEFAULT_WORKSPACES: WorkspaceItem[] = [
  {
    id: "tethys",
    name: "tethys",
    path: "~/Code/tethys",
    sourceKind: "Git · GitHub",
    isRemote: false,
    branch: "feat/m1.6-design-system-shell",
    statusSummary: "feat/m1.6-design-system-shell · 1 session",
    needsAttention: false,
    starred: true,
    permissionMode: "Supervised",
    sessions: [
      {
        id: "s-m16",
        branch: "feat/m1.6-design-system-shell",
        diffStat: "+34 -12",
        turn: "T8",
        provider: "Claude Code",
        status: "running",
      },
    ],
  },
];

export interface WorkspacesViewProps {
  onNavigate?: (route: string) => void;
}

export function WorkspacesView({ onNavigate }: WorkspacesViewProps) {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [environmentFilter, setEnvironmentFilter] = useState<
    "local" | "remote"
  >("local");
  const [filterNeedsAttention, setFilterNeedsAttention] =
    useState<boolean>(false);
  const [sortOption, setSortOption] = useState<"recent" | "name" | "sessions">(
    "recent",
  );
  const [selectedWorkspace, setSelectedWorkspace] =
    useState<WorkspaceItem | null>(null);
  const [peekDrawerOpen, setPeekDrawerOpen] = useState<boolean>(false);
  const [peekTab, setPeekTab] = useState<"sessions" | "approvals" | "trust">(
    "sessions",
  );
  const [trustDialogOpen, setTrustDialogOpen] = useState<boolean>(false);
  const [workspaces, setWorkspaces] =
    useState<WorkspaceItem[]>(DEFAULT_WORKSPACES);

  const attentionCount = workspaces.filter((w) => w.needsAttention).length;

  const filteredWorkspaces = workspaces
    .filter((ws) => {
      if (environmentFilter === "local" && ws.isRemote) return false;
      if (environmentFilter === "remote" && !ws.isRemote) return false;
      if (filterNeedsAttention && !ws.needsAttention) return false;
      if (
        searchQuery &&
        !ws.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !ws.path.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortOption === "name") return a.name.localeCompare(b.name);
      if (sortOption === "sessions")
        return b.sessions.length - a.sessions.length;
      return 0; // recent order preserved
    });

  const toggleStar = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === id ? { ...w, starred: !w.starred } : w)),
    );
  };

  const handleOpenWorkspace = (ws: WorkspaceItem) => {
    setSelectedWorkspace(ws);
    setPeekTab(ws.needsAttention ? "approvals" : "sessions");
    setPeekDrawerOpen(true);
  };

  const handleInitGit = (e: React.MouseEvent, wsId: string) => {
    e.stopPropagation();
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === wsId
          ? {
              ...w,
              sourceKind: "Git · local",
              branch: "main",
              statusSummary: "main · idle",
            }
          : w,
      ),
    );
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-(--tethys-canvas)">
      {/* Top Header Bar */}
      <section
        aria-label="Workspaces toolbar"
        className="flex h-16 shrink-0 items-center justify-between gap-lg border-b border-(--tethys-hairline) px-2xl"
      >
        <div className="flex items-center gap-lg">
          <h1 className="text-heading-lg text-(--tethys-text-primary)">
            Workspaces
          </h1>

          {/* Local vs Remote Segmented Control */}
          <SegmentedControl
            value={environmentFilter}
            onChange={setEnvironmentFilter}
            options={[
              { value: "local", label: "Local" },
              { value: "remote", label: "Remote" },
            ]}
          />
        </div>

        <div className="flex items-center gap-md">
          {/* Search bar with Ctrl+K pill */}
          <div className="w-64">
            <Input
              type="text"
              aria-label="Search workspaces"
              placeholder="Search workspaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leadingIcon={<MagnifyingGlass className="size-3.5" />}
              trailingIcon={<KeycapPill>Ctrl+K</KeycapPill>}
            />
          </div>

          {/* Needs Attention Filter Chip */}
          {attentionCount > 0 && (
            <Button
              variant="secondary"
              aria-pressed={filterNeedsAttention}
              onClick={() => setFilterNeedsAttention((prev) => !prev)}
              className={
                filterNeedsAttention
                  ? "border-warning-soft tint-warning text-(--tethys-text-primary)"
                  : undefined
              }
            >
              <StatusDot status="awaiting_approval" />
              <span>Needs attention ({attentionCount})</span>
            </Button>
          )}

          {/* Primary + New button */}
          <Button variant="primary" onClick={() => setTrustDialogOpen(true)}>
            <Plus className="size-3.5" />
            <span>New Workspace</span>
          </Button>
        </div>
      </section>

      {/* Sub-bar: Count, Sort dropdown, and View Mode Toggles */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-(--tethys-hairline) px-2xl text-label-md font-normal text-(--tethys-text-muted)">
        <div className="flex items-center gap-lg">
          <span className="text-label-md text-(--tethys-text-secondary)">
            {filteredWorkspaces.length} Workspaces
          </span>

          <div className="flex items-center gap-sm">
            <span>Sort</span>
            <Select
              aria-label="Sort workspaces"
              value={sortOption}
              onChange={(e) =>
                setSortOption(e.target.value as "recent" | "name" | "sessions")
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
            onClick={() => setViewMode("grid")}
            className={
              viewMode === "grid"
                ? "bg-(--tethys-surface-active) text-(--tethys-text-primary)"
                : "text-(--tethys-text-muted)"
            }
          >
            <GridSquare className="size-4" />
          </IconButton>

          <IconButton
            size="compact"
            label="List view"
            onClick={() => setViewMode("list")}
            className={
              viewMode === "list"
                ? "bg-(--tethys-surface-active) text-(--tethys-text-primary)"
                : "text-(--tethys-text-muted)"
            }
          >
            <ListUnordered className="size-4" />
          </IconButton>
        </div>
      </div>

      {/* Main Grid / Catalog Area */}
      <main
        aria-label="Workspace Catalog"
        className="flex-1 overflow-y-auto p-2xl"
      >
        <h2 className="sr-only">Workspace List</h2>
        {filteredWorkspaces.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title="No workspaces match the filter"
              description="Clear search or environment filters to view all configured repositories."
              action={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setSearchQuery("");
                    setFilterNeedsAttention(false);
                    setEnvironmentFilter("local");
                  }}
                >
                  Reset Filters
                </Button>
              }
            />
          </div>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 gap-lg md:grid-cols-2 lg:grid-cols-3"
                : "flex max-w-4xl flex-col gap-md"
            }
          >
            {filteredWorkspaces.map((ws) => (
              <Card
                key={ws.id}
                className={`group relative flex h-[220px] flex-col justify-between p-lg transition-colors hover:border-(--tethys-hairline-strong) hover:bg-(--tethys-surface-card-hover) ${
                  ws.needsAttention ? "border-warning-soft" : ""
                }`}
              >
                {/* Card Top: Source badge + Name + Star */}
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-sm truncate">
                    <Badge variant="muted" className="shrink-0">
                      {ws.sourceKind}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => handleOpenWorkspace(ws)}
                      className="focus-ring truncate rounded-xs text-left text-heading-md text-(--tethys-text-primary) hover:underline"
                    >
                      {ws.name}
                    </button>
                    {ws.needsAttention && (
                      <StatusDot
                        status="awaiting_approval"
                        className="shrink-0"
                        title="1 session awaiting your approval"
                      />
                    )}
                  </div>

                  <IconButton
                    size="compact"
                    label={ws.starred ? "Unstar workspace" : "Star workspace"}
                    onClick={(e) => toggleStar(e, ws.id)}
                    className={`shrink-0 ${
                      ws.starred
                        ? "text-(--tethys-status-warning)"
                        : "text-(--tethys-text-muted)"
                    }`}
                  >
                    <Star
                      className={`size-3.5 ${ws.starred ? "fill-current" : ""}`}
                    />
                  </IconButton>
                </div>

                {/* Path line */}
                <span className="truncate font-mono text-mono-code text-(--tethys-text-muted)">
                  {ws.path}
                </span>

                {/* Center Canvas: Git topology or Session chips or Single-node */}
                <div className="dot-matrix my-sm flex flex-1 flex-col justify-center gap-1.5 overflow-hidden rounded-md border border-(--tethys-hairline) bg-(--tethys-canvas) p-2.5">
                  {ws.sourceKind === "Folder · no VCS" ? (
                    <div className="flex items-center justify-between gap-sm px-1">
                      <div className="flex items-center gap-sm text-(--tethys-text-muted)">
                        <TerminalWindow className="size-4 opacity-70" />
                        <span className="text-label-md font-normal">
                          Single-session folder
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => handleInitGit(e, ws.id)}
                        className="h-6 px-2 text-(--tethys-accent-focus)"
                      >
                        Initialize git →
                      </Button>
                    </div>
                  ) : ws.sessions.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {ws.sessions.map((sess) => (
                        <button
                          key={sess.id}
                          type="button"
                          onClick={() => onNavigate?.(`/thread/${sess.id}`)}
                          className={`focus-ring flex items-center justify-between rounded-sm border px-2 py-1 text-left transition-colors hover:border-(--tethys-hairline-strong) ${
                            sess.status === "waiting_approval"
                              ? "border-warning-soft tint-warning text-(--tethys-text-primary)"
                              : "border-(--tethys-hairline) bg-(--tethys-surface-panel) text-(--tethys-text-primary)"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <GitBranch className="size-3 shrink-0 text-(--tethys-text-muted)" />
                            <span className="truncate font-mono text-mono-micro">
                              {sess.branch}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-sm text-(--tethys-text-muted)">
                            <span className="font-mono text-mono-micro">
                              {sess.diffStat}
                            </span>
                            <span className="rounded-xs bg-(--tethys-surface-hover) px-1 font-mono text-mono-micro">
                              {sess.turn}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-sm text-(--tethys-text-muted)">
                      <GitBranch className="size-3.5 opacity-50" />
                      <span className="text-label-md font-normal">
                        Trunk main · ready for new thread
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Footer: Status dot + summary + New Thread action */}
                <div className="flex items-center justify-between text-label-md font-normal text-(--tethys-text-muted)">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <StatusDot
                      status={
                        ws.needsAttention
                          ? "awaiting_approval"
                          : ws.sessions.some(
                                (sess) => sess.status === "running",
                              )
                            ? "running"
                            : "idle"
                      }
                    />
                    <span className="truncate">{ws.statusSummary}</span>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onNavigate?.("/thread/new")}
                    className="h-6 px-2 text-(--tethys-accent-focus)"
                  >
                    <Plus className="size-3" />
                    <span>Thread</span>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Workspace Peek Drawer */}
      <Drawer
        open={peekDrawerOpen}
        onClose={() => setPeekDrawerOpen(false)}
        title={selectedWorkspace?.name ?? "Workspace Details"}
        side="right"
        width="w-(--layout-drawer-peek)"
      >
        {selectedWorkspace && (
          <div className="flex h-full flex-col gap-lg">
            <div className="flex flex-col gap-1.5 border-b border-(--tethys-hairline) pb-lg">
              <div className="flex items-center gap-sm">
                <Badge variant="muted">{selectedWorkspace.sourceKind}</Badge>
                <span className="text-heading-md text-(--tethys-text-primary)">
                  {selectedWorkspace.name}
                </span>
              </div>
              <span className="font-mono text-mono-code text-(--tethys-text-secondary)">
                {selectedWorkspace.path}
              </span>
            </div>

            <UnderlineTabs
              label="Workspace details"
              value={peekTab}
              onChange={setPeekTab}
              className="border-b border-(--tethys-hairline)"
              tabs={[
                {
                  value: "sessions",
                  label: `Sessions (${selectedWorkspace.sessions.length})`,
                },
                {
                  value: "approvals",
                  label: "Approvals",
                  adornment: selectedWorkspace.needsAttention ? (
                    <StatusDot status="awaiting_approval" inline />
                  ) : undefined,
                },
                { value: "trust", label: "Policy" },
              ]}
            />

            <div className="flex-1 overflow-y-auto">
              {peekTab === "sessions" ? (
                selectedWorkspace.sessions.length === 0 ? (
                  <div className="py-2xl text-center text-body-sm text-(--tethys-text-muted)">
                    No active sessions running in this workspace.
                  </div>
                ) : (
                  <div className="flex flex-col gap-md">
                    {selectedWorkspace.sessions.map((sess) => (
                      <Card
                        key={sess.id}
                        className="flex flex-col gap-sm bg-(--tethys-surface-nested) p-md"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-mono-code text-(--tethys-text-primary)">
                            {sess.branch}
                          </span>
                          <span className="text-label-sm text-(--tethys-text-muted)">
                            {sess.provider}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-body-sm text-(--tethys-text-secondary)">
                          <span>Turn {sess.turn}</span>
                          <span className="font-mono text-mono-code">
                            {sess.diffStat}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setPeekDrawerOpen(false);
                            onNavigate?.(`/thread/${sess.id}`);
                          }}
                          className="self-end"
                        >
                          Open Session →
                        </Button>
                      </Card>
                    ))}
                  </div>
                )
              ) : peekTab === "approvals" ? (
                selectedWorkspace.needsAttention ? (
                  <Card className="flex flex-col gap-md border-warning-soft tint-warning p-lg">
                    <div className="flex items-center gap-sm text-label-md text-(--tethys-status-warning)">
                      <Warning className="size-4" />
                      <span>Permission Request: session s-m16</span>
                    </div>
                    <p className="text-body-sm text-(--tethys-text-secondary)">
                      Provider{" "}
                      <strong className="text-(--tethys-text-primary)">
                        Claude Code
                      </strong>{" "}
                      requests permission to edit{" "}
                      <code className="rounded-xs bg-(--tethys-surface-nested) px-1 font-mono text-mono-code">
                        apps/desktop/src/routes/workspaces.tsx
                      </code>
                    </p>
                    <div className="flex gap-sm pt-sm">
                      <Button size="sm" variant="primary">
                        Allow Once
                      </Button>
                      <Button size="sm" variant="secondary">
                        Reject
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <div className="py-2xl text-center text-body-sm text-(--tethys-text-muted)">
                    No pending approvals for this workspace.
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="text-heading-md text-(--tethys-text-primary)">
                    Permission Mode
                  </span>
                  <span className="text-body-sm text-(--tethys-text-muted)">
                    Current policy:{" "}
                    <strong className="text-(--tethys-text-primary)">
                      {selectedWorkspace.permissionMode ?? "Supervised"}
                    </strong>
                  </span>
                  <p className="mt-1 text-body-sm text-(--tethys-text-secondary)">
                    Supervised mode requests explicit confirmation for write
                    tool calls.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Add Workspace Trust Dialog (§2.1) */}
      <ModalDialog
        open={trustDialogOpen}
        onClose={() => setTrustDialogOpen(false)}
        title="Trust this workspace folder?"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setTrustDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setTrustDialogOpen(false)}>
              Trust & Add Workspace
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-lg text-body-sm text-(--tethys-text-secondary)">
          <div className="flex items-center gap-sm text-(--tethys-status-warning)">
            <Shield className="size-5 shrink-0" />
            <span className="text-label-md">
              Coding agents will be able to read, edit, and run commands inside
              this folder.
            </span>
          </div>

          <div className="rounded-md border border-(--tethys-hairline) bg-(--tethys-surface-nested) p-md font-mono text-mono-code">
            Target: ~/Code/new-project
          </div>

          <p>
            Tethys creates an isolated git worktree per thread so parallel
            agents cannot collide.
          </p>
        </div>
      </ModalDialog>
    </div>
  );
}
